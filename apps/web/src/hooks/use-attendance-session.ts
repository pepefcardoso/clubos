"use client";

import { useCallback, useEffect, useReducer } from "react";
import { useLocalDb } from "@/hooks/use-local-db";
import { useSyncQueue } from "@/hooks/use-sync-queue";
import type { SessionType } from "@/lib/db/types";

export type AttendanceStatus = "pending" | "present" | "absent";

export interface SessionConfig {
  date: string;
  sessionType: SessionType;
  durationMinutes: number;
  rpe: number;
}

export interface AthleteAttendance {
  athleteId: string;
  name: string;
  status: AttendanceStatus;
}

type Action =
  | { type: "SET_ATHLETES"; payload: AthleteAttendance[] }
  | { type: "SET_STATUS"; athleteId: string; status: AttendanceStatus }
  | { type: "MARK_ALL_PRESENT" }
  | { type: "MARK_ALL_ABSENT" }
  | { type: "UPDATE_CONFIG"; payload: Partial<SessionConfig> }
  | { type: "SAVING" }
  | { type: "SAVED"; count: number }
  | { type: "RESET" };

interface State {
  config: SessionConfig;
  athletes: AthleteAttendance[];
  isSaving: boolean;
  savedCount: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialState(): State {
  return {
    config: {
      date: todayIso(),
      sessionType: "TRAINING",
      durationMinutes: 60,
      rpe: 7,
    },
    athletes: [],
    isSaving: false,
    savedCount: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_ATHLETES":
      return { ...state, athletes: action.payload };

    case "SET_STATUS":
      return {
        ...state,
        athletes: state.athletes.map((a) =>
          a.athleteId === action.athleteId
            ? { ...a, status: action.status }
            : a,
        ),
      };

    case "MARK_ALL_PRESENT":
      return {
        ...state,
        athletes: state.athletes.map((a) => ({ ...a, status: "present" })),
      };

    case "MARK_ALL_ABSENT":
      return {
        ...state,
        athletes: state.athletes.map((a) => ({ ...a, status: "absent" })),
      };

    case "UPDATE_CONFIG":
      return { ...state, config: { ...state.config, ...action.payload } };

    case "SAVING":
      return { ...state, isSaving: true };

    case "SAVED":
      return { ...state, isSaving: false, savedCount: action.count };

    case "RESET":
      return {
        ...initialState(),
        athletes: state.athletes.map((a) => ({ ...a, status: "pending" })),
      };

    default:
      return state;
  }
}

export interface AttendanceSessionReturn extends State {
  presentCount: number;
  absentCount: number;
  pendingCount: number;
  setStatus: (athleteId: string, status: AttendanceStatus) => void;
  updateConfig: (patch: Partial<SessionConfig>) => void;
  save: () => Promise<void>;
  reset: () => void;
  markAllPresent: () => void;
  markAllAbsent: () => void;
}

/**
 * Registers a Background Sync tag with the Service Worker.
 *
 * The OS will fire a `sync` event on the SW when connectivity is restored,
 * even if the browser tab is closed. This is a progressive enhancement:
 * - Chrome/Edge/Android: ✅ Full support
 * - Firefox/Safari: ❌ Silently ignored (app falls back to useSyncWorker)
 *
 * Safe to call multiple times — the browser de-duplicates tags.
 */
async function registerBackgroundSync(): Promise<void> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("SyncManager" in window)
  ) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register("sync-workload-sessions");
  } catch {
    // Registration can fail if:
    //   - SW is not yet active (first load before activation)
    //   - User denied notification/background permissions
    //   - Device is in a restricted power mode
    // All are non-fatal — the app degrades to in-tab sync.
  }
}

export function useAttendanceSession(): AttendanceSessionReturn {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const { getLocalAthletes, addTrainingSession } = useLocalDb();
  const { flushPending } = useSyncQueue();

  useEffect(() => {
    getLocalAthletes("ACTIVE").then((cached) => {
      dispatch({
        type: "SET_ATHLETES",
        payload: cached.map((a) => ({
          athleteId: a.id,
          name: a.name,
          status: "pending",
        })),
      });
    });
  }, [getLocalAthletes]);

  const setStatus = useCallback(
    (athleteId: string, status: AttendanceStatus) => {
      dispatch({ type: "SET_STATUS", athleteId, status });
    },
    [],
  );

  const updateConfig = useCallback((patch: Partial<SessionConfig>) => {
    dispatch({ type: "UPDATE_CONFIG", payload: patch });
  }, []);

  const save = useCallback(async () => {
    const present = state.athletes.filter((a) => a.status === "present");
    if (present.length === 0) return;

    dispatch({ type: "SAVING" });

    await Promise.all(
      present.map((a) =>
        addTrainingSession({
          athleteId: a.athleteId,
          date: state.config.date,
          rpe: state.config.rpe,
          durationMinutes: state.config.durationMinutes,
          sessionType: state.config.sessionType,
          notes: null,
        }),
      ),
    );

    dispatch({ type: "SAVED", count: present.length });

    void registerBackgroundSync();

    if (navigator.onLine) {
      void flushPending();
    }
  }, [state.athletes, state.config, addTrainingSession, flushPending]);

  const reset = useCallback(() => dispatch({ type: "RESET" }), []);
  const markAllPresent = useCallback(
    () => dispatch({ type: "MARK_ALL_PRESENT" }),
    [],
  );
  const markAllAbsent = useCallback(
    () => dispatch({ type: "MARK_ALL_ABSENT" }),
    [],
  );

  const presentCount = state.athletes.filter(
    (a) => a.status === "present",
  ).length;
  const absentCount = state.athletes.filter(
    (a) => a.status === "absent",
  ).length;
  const pendingCount = state.athletes.filter(
    (a) => a.status === "pending",
  ).length;

  return {
    ...state,
    presentCount,
    absentCount,
    pendingCount,
    setStatus,
    updateConfig,
    save,
    reset,
    markAllPresent,
    markAllAbsent,
  };
}
