"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { getDb } from "@/lib/db";
import type { ChecklistQueueEntry } from "@/lib/db/types";
import {
  fetchChecklist,
  toggleChecklistItem as apiToggle,
  type ChecklistItemResponse,
  type ChecklistResponse,
} from "@/lib/api/checklist";

type ItemMap = Record<string, ChecklistItemResponse>;

interface ChecklistState {
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  byCategory: Record<string, ChecklistItemResponse[]>;
  items: ItemMap;
  totalItems: number;
  completedItems: number;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: ChecklistResponse }
  | { type: "FETCH_ERROR"; message: string }
  | {
      type: "TOGGLE_OPTIMISTIC";
      itemId: string;
      completed: boolean;
      now: string;
    }
  | { type: "TOGGLE_REVERT"; itemId: string; prev: ChecklistItemResponse }
  | { type: "TOGGLE_COMMIT"; item: ChecklistItemResponse };

function buildDerived(
  items: ItemMap,
): Pick<ChecklistState, "byCategory" | "totalItems" | "completedItems"> {
  const byCategory: Record<string, ChecklistItemResponse[]> = {};
  for (const item of Object.values(items)) {
    (byCategory[item.category] ??= []).push(item);
  }
  const ORDER = [
    "EQUIPAMENTOS",
    "LOGÍSTICA",
    "MÉDICO",
    "DOCUMENTAÇÃO",
    "CAMPO",
  ];
  const sorted: Record<string, ChecklistItemResponse[]> = {};
  for (const cat of ORDER) {
    if (byCategory[cat]) sorted[cat] = byCategory[cat];
  }
  for (const cat of Object.keys(byCategory)) {
    if (!sorted[cat]) sorted[cat] = byCategory[cat]!;
  }
  const all = Object.values(items);
  return {
    byCategory: sorted,
    totalItems: all.length,
    completedItems: all.filter((i) => i.completed).length,
  };
}

function reducer(state: ChecklistState, action: Action): ChecklistState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, isLoading: true, isError: false, errorMessage: null };

    case "FETCH_SUCCESS": {
      const items: ItemMap = {};
      for (const group of Object.values(action.payload.byCategory)) {
        for (const item of group) items[item.id] = item;
      }
      return {
        isLoading: false,
        isError: false,
        errorMessage: null,
        items,
        ...buildDerived(items),
      };
    }

    case "FETCH_ERROR":
      return {
        ...state,
        isLoading: false,
        isError: true,
        errorMessage: action.message,
      };

    case "TOGGLE_OPTIMISTIC": {
      const prev = state.items[action.itemId];
      if (!prev) return state;
      const updated: ChecklistItemResponse = {
        ...prev,
        completed: action.completed,
        completedAt: action.completed ? action.now : null,
        updatedAt: action.now,
      };
      const items = { ...state.items, [action.itemId]: updated };
      return { ...state, items, ...buildDerived(items) };
    }

    case "TOGGLE_REVERT": {
      const items = { ...state.items, [action.prev.id]: action.prev };
      return { ...state, items, ...buildDerived(items) };
    }

    case "TOGGLE_COMMIT": {
      const items = { ...state.items, [action.item.id]: action.item };
      return { ...state, items, ...buildDerived(items) };
    }

    default:
      return state;
  }
}

const INITIAL_STATE: ChecklistState = {
  isLoading: true,
  isError: false,
  errorMessage: null,
  byCategory: {},
  items: {},
  totalItems: 0,
  completedItems: 0,
};

async function upsertQueueEntry(
  entry: Omit<ChecklistQueueEntry, "localId">,
): Promise<void> {
  const db = getDb();
  const existing = await db.checklistQueue
    .where("[eventId+itemId]")
    .equals([entry.eventId, entry.itemId])
    .and((r) => r.syncStatus === "pending")
    .first();

  if (existing) {
    await db.checklistQueue.update(existing.localId, {
      completed: entry.completed,
      updatedAt: Date.now(),
    });
  } else {
    await db.checklistQueue.add({
      ...entry,
      localId: crypto.randomUUID(),
    });
  }
}

export interface UseChecklistReturn {
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  byCategory: Record<string, ChecklistItemResponse[]>;
  totalItems: number;
  completedItems: number;
  isSyncing: boolean;
  toggle: (itemId: string, completed: boolean) => Promise<void>;
  refetch: () => void;
}

export function useChecklist(eventId: string): UseChecklistReturn {
  const { getAccessToken, user } = useAuth();
  const { isOnline } = useNetworkStatus();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const isSyncingRef = useRef(false);
  const [isSyncing, setIsSyncing] = useReducerBool(false);

  const load = useCallback(async () => {
    dispatch({ type: "FETCH_START" });
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada.");

      const data = await fetchChecklist(eventId, token);
      dispatch({ type: "FETCH_SUCCESS", payload: data });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível carregar o checklist.";
      dispatch({ type: "FETCH_ERROR", message });
    }
  }, [eventId, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const flushQueue = useCallback(async () => {
    if (isSyncingRef.current || !user?.clubId) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    const db = getDb();

    try {
      const pending = await db.checklistQueue
        .where("[eventId+itemId]")
        .between([eventId, Dexie.minKey], [eventId, Dexie.maxKey])
        .and((r) => r.syncStatus === "pending")
        .toArray();

      const latestMap = new Map<string, ChecklistQueueEntry>();
      for (const entry of pending) {
        const existing = latestMap.get(entry.itemId);
        if (!existing || entry.updatedAt > existing.updatedAt) {
          latestMap.set(entry.itemId, entry);
        }
      }

      const token = await getAccessToken();
      if (!token) return;

      for (const entry of latestMap.values()) {
        await db.checklistQueue.update(entry.localId, {
          syncStatus: "syncing",
        });
        try {
          const item = await apiToggle(
            eventId,
            entry.itemId,
            entry.completed,
            token,
          );
          await db.checklistQueue.update(entry.localId, {
            syncStatus: "synced",
          });
          dispatch({ type: "TOGGLE_COMMIT", item });
        } catch (err) {
          const syncError =
            err instanceof Error ? err.message : "Erro desconhecido.";
          await db.checklistQueue.update(entry.localId, {
            syncStatus: "error",
            syncError,
          });
        }
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [eventId, getAccessToken, user?.clubId, setIsSyncing]);

  useEffect(() => {
    if (isOnline && user?.clubId) {
      void flushQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, user?.clubId]);

  const toggle = useCallback(
    async (itemId: string, completed: boolean) => {
      const now = new Date().toISOString();
      const prev = state.items[itemId];
      if (!prev) return;

      dispatch({ type: "TOGGLE_OPTIMISTIC", itemId, completed, now });

      if (isOnline) {
        try {
          const token = await getAccessToken();
          if (!token) throw new Error("Sessão expirada.");

          const item = await apiToggle(eventId, itemId, completed, token);
          dispatch({ type: "TOGGLE_COMMIT", item });
        } catch {
          dispatch({ type: "TOGGLE_REVERT", itemId, prev });
        }
      } else {
        await upsertQueueEntry({
          clubId: user?.clubId ?? "",
          eventId,
          itemId,
          completed,
          syncStatus: "pending",
          syncError: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    },
    [eventId, getAccessToken, isOnline, state.items, user?.clubId],
  );

  return {
    isLoading: state.isLoading,
    isError: state.isError,
    errorMessage: state.errorMessage,
    byCategory: state.byCategory,
    totalItems: state.totalItems,
    completedItems: state.completedItems,
    isSyncing,
    toggle,
    refetch: load,
  };
}

function useReducerBool(initial: boolean): [boolean, (v: boolean) => void] {
  const [val, dispatch] = useReducer(
    (_: boolean, next: boolean) => next,
    initial,
  );
  return [val, dispatch];
}

import Dexie from "dexie";
