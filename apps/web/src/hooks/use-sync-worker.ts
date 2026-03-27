"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import {
  flushPendingSessions,
  resetStuckSyncingSessions,
} from "@/lib/sync/sync-worker";
import { resetErroredSessions } from "@/lib/db/training-sessions.db";

export interface SyncWorkerState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  lastSyncResult: { synced: number; failed: number } | null;
  /** Manually trigger a flush (e.g. after adding a new session) */
  triggerSync: () => void;
}

/**
 * Mounts the sync worker for the authenticated user's club.
 *
 * Triggers automatically when:
 *   1. The app comes online (window 'online' event — via useNetworkStatus)
 *   2. The user explicitly calls `triggerSync()`
 *
 * On first mount, resets any sessions stuck in `syncing` state (recovery from
 * app-kill mid-sync). Before each flush, resets errored sessions back to pending
 * so they get another chance on reconnection.
 *
 * Mount this ONCE at the authenticated layout level (AppShell or equivalent).
 * Do NOT mount in individual pages — duplicate workers would race each other.
 */
export function useSyncWorker(): SyncWorkerState {
  const { user, getAccessToken } = useAuth();
  const { isOnline } = useNetworkStatus();

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    synced: number;
    failed: number;
  } | null>(null);

  const flushLockRef = useRef(false);

  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const flush = useCallback(async () => {
    if (!user?.clubId) return;
    if (flushLockRef.current) return;

    flushLockRef.current = true;
    setIsSyncing(true);

    try {
      await resetErroredSessions(user.clubId);

      const result = await flushPendingSessions(user.clubId, {
        getAccessToken,
      });
      setLastSyncAt(new Date());
      setLastSyncResult({ synced: result.synced, failed: result.failed });
    } catch {
      // Sync failure is non-fatal — next online event will retry
    } finally {
      flushLockRef.current = false;
      setIsSyncing(false);
    }
  }, [user?.clubId, getAccessToken]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (!user?.clubId) return;
    void resetStuckSyncingSessions(user.clubId).catch(() => {
      // Non-fatal — if IDB is unavailable, the stuck sessions will be retried
      // when the app restarts and IDB comes back.
    });
  }, [user?.clubId]);

  useEffect(() => {
    if (isOnline && user?.clubId) {
      void flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, user?.clubId]);

  const triggerSync = useCallback(() => {
    if (flushRef.current) {
      void flushRef.current();
    }
  }, []);

  return { isSyncing, lastSyncAt, lastSyncResult, triggerSync };
}
