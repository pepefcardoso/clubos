"use client";

import { useEffect, useState } from "react";
import { useLocalDb } from "@/hooks/use-local-db";
import { useNetworkStatus } from "@/hooks/use-network-status";

/**
 * Returns the number of training sessions currently pending server sync
 * for the authenticated user's club.
 *
 * Re-reads the count:
 *   - On every online/offline transition so the badge updates after a
 *     successful flush (online → offline → online cycle).
 *   - When `lastSyncAt` changes, so the badge clears immediately after
 *     a sync completes without waiting for the next connectivity event.
 *     Pass `lastSyncAt` from `useSyncWorker` to wire this up.
 *
 * Returns 0 if the user is unauthenticated or if the IDB read fails.
 */
export function usePendingSyncCount(lastSyncAt?: Date | null): number {
  const [count, setCount] = useState(0);
  const localDb = useLocalDb();
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    localDb
      .pendingCount()
      .then(setCount)
      .catch(() => setCount(0));
  }, [localDb, isOnline, lastSyncAt]);

  return count;
}
