"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocalDb } from "@/hooks/use-local-db";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { postWorkloadMetric, WorkloadApiError } from "@/lib/api/workload";
import type {
  CreateTrainingSessionInput,
  TrainingSession,
} from "@/lib/db/types";

export interface RecordWorkloadInput {
  athleteId: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Foster Session-RPE scale: 1–10 */
  rpe: number;
  durationMinutes: number;
  sessionType: CreateTrainingSessionInput["sessionType"];
  notes?: string | null;
}

export interface SyncQueueState {
  /**
   * Record a workload metric. Saves to IndexedDB immediately and attempts
   * an optimistic sync if the device is currently online.
   *
   * Returns the locally-created session so the UI can update optimistically
   * without waiting for the server round-trip.
   *
   * @throws {Error} When the user is not authenticated.
   */
  record: (input: RecordWorkloadInput) => Promise<TrainingSession>;

  /**
   * Attempt to sync all pending sessions for the current club.
   * Called automatically when the network comes back online.
   * Safe to call manually (e.g. pull-to-refresh, retry button).
   *
   * Concurrent calls are de-duplicated — the second call is a no-op while
   * a flush is already in progress.
   */
  flushPending: () => Promise<void>;
}

/**
 * Manages the offline-first workload recording queue.
 *
 * Responsibilities (T-089 scope):
 *   1. Persist new sessions to IndexedDB immediately (syncStatus='pending').
 *   2. Attempt best-effort immediate sync when online.
 *   3. Trigger flushPending() automatically on network reconnection.
 *
 * Out of scope (T-090):
 *   - Background Sync API / Service Worker retry
 *   - Exponential backoff with retry counter
 *   - Moving sessions to permanent 'error' state after N retries
 */
export function useSyncQueue(): SyncQueueState {
  const { getAccessToken, user } = useAuth();
  const localDb = useLocalDb();
  const { isOnline } = useNetworkStatus();

  const isFlushing = useRef(false);
  const prevIsOnline = useRef(isOnline);

  /**
   * Attempt to POST a single pending session to the server.
   *
   * Calls markSessionSyncing() before the fetch to prevent duplicate
   * in-flight requests if flushPending is triggered concurrently.
   *
   * On failure the session is moved to 'error' status so T-090 can apply
   * its retry policy. This hook does NOT implement retries itself.
   */
  const attemptSync = useCallback(
    async (session: TrainingSession): Promise<void> => {
      const token = await getAccessToken();
      if (!token) return;

      await localDb.setSyncing(session.localId);

      try {
        const result = await postWorkloadMetric(
          {
            athleteId: session.athleteId,
            date: session.date,
            rpe: session.rpe,
            durationMinutes: session.durationMinutes,
            sessionType: session.sessionType,
            notes: session.notes,
            idempotencyKey: session.localId,
          },
          token,
        );

        await localDb.setSynced(session.localId, result.id);
      } catch (err) {
        const message =
          err instanceof WorkloadApiError
            ? `HTTP ${err.status}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Unknown sync error";

        await localDb.setError(session.localId, message);
      }
    },
    [getAccessToken, localDb],
  );

  /**
   * Drain the pending queue for the current club, one item at a time.
   *
   * Sequential processing (not parallel) is intentional: it avoids
   * overwhelming a slow connection and makes the sync log predictable.
   * Processing stops immediately if the device goes offline mid-flush.
   */
  const flushPending = useCallback(async (): Promise<void> => {
    if (isFlushing.current) return;
    if (!user?.clubId) return;

    isFlushing.current = true;
    try {
      const pending = await localDb.getPending();
      for (const session of pending) {
        if (!navigator.onLine) break;
        await attemptSync(session);
      }
    } finally {
      isFlushing.current = false;
    }
  }, [user?.clubId, localDb, attemptSync]);

  /**
   * Auto-flush when the device comes back online.
   *
   * Only fires on the false → true transition (not on every render where
   * isOnline is already true) to avoid a redundant flush on mount when
   * the user was online the whole time.
   */
  useEffect(() => {
    if (isOnline && !prevIsOnline.current) {
      void flushPending();
    }
    prevIsOnline.current = isOnline;
  }, [isOnline, flushPending]);

  /**
   * Record a workload entry locally and attempt an immediate sync.
   *
   * The IDB write always succeeds (offline or online). The sync attempt
   * is fire-and-forget — it does not block the return value, so the UI
   * gets the session object immediately for optimistic rendering.
   */
  const record = useCallback(
    async (input: RecordWorkloadInput): Promise<TrainingSession> => {
      if (!user?.clubId) {
        throw new Error("Cannot record workload: user is not authenticated");
      }

      const session = await localDb.addTrainingSession({
        athleteId: input.athleteId,
        date: input.date,
        rpe: input.rpe,
        durationMinutes: input.durationMinutes,
        sessionType: input.sessionType,
        notes: input.notes ?? null,
      });

      if (navigator.onLine) {
        void attemptSync(session);
      }

      return session;
    },
    [user?.clubId, localDb, attemptSync],
  );

  return { record, flushPending };
}
