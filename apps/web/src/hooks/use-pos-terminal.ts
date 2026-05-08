// apps/web/src/hooks/use-pos-terminal.ts — NEW

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import {
  createPosEntry,
  getPosSalesForEvent,
  resetErroredPosSales,
  resetStuckPosSales,
} from "@/lib/db/pos.db";
import { flushPendingPosSales } from "@/lib/sync/pos-sync";
import {
  fetchActivePosProducts,
  type PosProductItem,
} from "@/lib/api/pos-terminal";
import type { PosQueueEntry } from "@/lib/db/types";

export type { PosProductItem };

export interface UsePosTerminalReturn {
  products: PosProductItem[];
  productsLoading: boolean;
  entries: PosQueueEntry[];
  totalSalesCents: number;
  pendingCount: number;
  isSyncing: boolean;
  syncError: string | null;
  submit: (
    product: PosProductItem,
    method: "CARD" | "PIX",
  ) => Promise<PosQueueEntry>;
  flush: () => Promise<void>;
}

export function usePosTerminal(eventId: string): UsePosTerminalReturn {
  const { user, getAccessToken } = useAuth();
  const { isOnline } = useNetworkStatus();
  const prevOnlineRef = useRef(isOnline);
  const isFlushing = useRef(false);

  const [entries, setEntries] = useState<PosQueueEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const clubId = user?.clubId ?? "";

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["pos-products-active", clubId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada.");
      return fetchActivePosProducts(clubId, token);
    },
    staleTime: 5 * 60 * 1_000,
    enabled: !!clubId,
  });

  const reloadEntries = useCallback(async () => {
    if (!clubId) return;
    const rows = await getPosSalesForEvent(clubId, eventId);
    setEntries(rows);
  }, [clubId, eventId]);

  useEffect(() => {
    if (!clubId) return;
    void resetStuckPosSales(clubId);
    void reloadEntries();
  }, [clubId, reloadEntries]);

  const flush = useCallback(async () => {
    if (isFlushing.current || !clubId) return;
    isFlushing.current = true;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await resetErroredPosSales(clubId);
      await flushPendingPosSales(clubId, getAccessToken);
      await reloadEntries();
    } catch {
      setSyncError("Falha na sincronização. Tente novamente.");
    } finally {
      isFlushing.current = false;
      setIsSyncing(false);
    }
  }, [clubId, getAccessToken, reloadEntries]);

  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (wasOffline && isOnline) {
      void flush();
    }
  }, [isOnline, flush]);

  const submit = useCallback(
    async (
      product: PosProductItem,
      method: "CARD" | "PIX",
    ): Promise<PosQueueEntry> => {
      const entry = await createPosEntry({
        clubId,
        eventId,
        productName: product.name,
        amountCents: product.priceCents,
        method,
      });
      await reloadEntries();
      if (isOnline) {
        void flush();
      }
      return entry;
    },
    [clubId, eventId, isOnline, flush, reloadEntries],
  );

  const totalSalesCents = entries
    .filter((e) => e.syncStatus === "synced")
    .reduce((sum, e) => sum + e.amountCents, 0);

  const pendingCount = entries.filter(
    (e) => e.syncStatus === "pending" || e.syncStatus === "error",
  ).length;

  return {
    products,
    productsLoading,
    entries,
    totalSalesCents,
    pendingCount,
    isSyncing,
    syncError,
    submit,
    flush,
  };
}
