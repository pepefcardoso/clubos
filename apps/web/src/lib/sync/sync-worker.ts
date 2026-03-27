import {
  getPendingSessions,
  markSessionSyncing,
  markSessionSynced,
  markSessionError,
} from "@/lib/db/training-sessions.db";
import { postWorkloadMetric, WorkloadApiError } from "@/lib/api/workload";
import type { TrainingSession } from "@/lib/db/types";

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
}

export interface SyncWorkerOptions {
  /** Returns a fresh access token (may trigger a silent refresh) */
  getAccessToken: () => Promise<string | null>;
  /** Delay function — injected for testability; defaults to real setTimeout */
  delay?: (ms: number) => Promise<void>;
  /** Maximum attempts per session per flush call */
  maxAttempts?: number;
}

const DEFAULT_BACKOFF_MS = [0, 5_000, 15_000] as const;

/**
 * Flushes all pending sessions for a club to the server.
 *
 * Design principles:
 * - Each session is attempted independently; one failure does not abort others.
 * - Uses `localId` as `idempotencyKey` — safe to retry; server deduplicates.
 * - Marks `syncing` before the request to prevent concurrent duplicate sends.
 * - Non-retryable (4xx) errors are marked permanently; retryable errors are
 *   marked `error` so the next connectivity event picks them up via
 *   `resetErroredSessions`.
 *
 * Called from:
 *   - `useSyncWorker` hook (React layer) on online event
 *   - SW `sync` event handler (T-104)
 */
export async function flushPendingSessions(
  clubId: string,
  opts: SyncWorkerOptions,
): Promise<SyncResult> {
  const {
    getAccessToken,
    delay = (ms) => new Promise((r) => setTimeout(r, ms)),
    maxAttempts = 3,
  } = opts;

  const sessions = await getPendingSessions(clubId);
  if (sessions.length === 0) {
    return { synced: 0, failed: 0, skipped: 0 };
  }

  const token = await getAccessToken();
  if (!token) {
    return { synced: 0, failed: 0, skipped: sessions.length };
  }

  let synced = 0;
  let failed = 0;

  for (const session of sessions) {
    const result = await syncSession(session, token, { delay, maxAttempts });
    if (result === "synced") synced++;
    else failed++;
  }

  return { synced, failed, skipped: 0 };
}

type SessionOutcome = "synced" | "failed";

async function syncSession(
  session: TrainingSession,
  token: string,
  opts: { delay: (ms: number) => Promise<void>; maxAttempts: number },
): Promise<SessionOutcome> {
  const { delay, maxAttempts } = opts;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const waitMs =
      DEFAULT_BACKOFF_MS[attempt] ??
      DEFAULT_BACKOFF_MS[DEFAULT_BACKOFF_MS.length - 1]!;
    if (waitMs > 0) await delay(waitMs);

    await markSessionSyncing(session.localId);

    try {
      const response = await postWorkloadMetric(
        {
          athleteId: session.athleteId,
          date: session.date,
          rpe: session.rpe,
          durationMinutes: session.durationMinutes,
          sessionType: session.sessionType,
          notes: session.notes ?? undefined,
          idempotencyKey: session.localId,
        },
        token,
      );

      await markSessionSynced(session.localId, response.id);
      return "synced";
    } catch (err) {
      if (err instanceof WorkloadApiError) {
        if (!err.retryable) {
          await markSessionError(
            session.localId,
            `[non-retryable] HTTP ${err.status}: ${err.message}`,
          );
          return "failed";
        }

        if (attempt === maxAttempts - 1) {
          await markSessionError(
            session.localId,
            `[retryable] HTTP ${err.status}: ${err.message}`,
          );
          return "failed";
        }

        continue;
      }

      if (attempt === maxAttempts - 1) {
        const message = err instanceof Error ? err.message : "Network error";
        await markSessionError(session.localId, `[network] ${message}`);
        return "failed";
      }
    }
  }

  return "failed";
}

/**
 * Resets any sessions stuck in `syncing` state back to `pending`.
 * Called on app bootstrap to recover from a mid-sync crash.
 * Sessions enter `syncing` when the app is killed between markSessionSyncing
 * and markSessionSynced/markSessionError.
 */
export async function resetStuckSyncingSessions(
  clubId: string,
): Promise<number> {
  const { db } = await import("@/lib/db/index");

  const stuck = await db.trainingSessions
    .where("[clubId+syncStatus]")
    .equals([clubId, "syncing"])
    .toArray();

  if (stuck.length === 0) return 0;

  const now = Date.now();
  await Promise.all(
    stuck.map((s) =>
      db.trainingSessions.update(s.localId, {
        syncStatus: "pending",
        syncError: null,
        updatedAt: now,
      }),
    ),
  );

  return stuck.length;
}
