import Dexie from "dexie";
import { db } from "./index";
import type {
  TrainingSession,
  CreateTrainingSessionInput,
  SyncStatus,
} from "./types";

/**
 * Generates a 32-character hex ID using the Web Crypto API.
 * Available in all modern browsers and in Service Worker context. Falls back to Math.random() only if crypto
 * is unavailable (test environments without jsdom).
 *
 * This ID becomes the idempotency key sent to POST /api/workload/metrics,
 * ensuring that a retried sync does not create duplicate server records.
 */
function generateLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2).padEnd(32, "0");
}

/**
 * Creates a new offline training session with syncStatus="pending".
 * The record is immediately persisted to IndexedDB and returned.
 * The caller does not need to set localId, syncStatus, timestamps, or serverId.
 */
export async function createLocalTrainingSession(
  input: CreateTrainingSessionInput,
): Promise<TrainingSession> {
  const now = Date.now();
  const session: TrainingSession = {
    ...input,
    localId: generateLocalId(),
    syncStatus: "pending",
    syncError: null,
    createdAt: now,
    updatedAt: now,
    serverId: null,
  };
  await db.trainingSessions.add(session);
  return session;
}

/**
 * Returns all sessions with syncStatus="pending" for a club, sorted oldest-first.
 * This is the primary feed for the Background Sync worker.
 * Uses the compound [clubId+syncStatus] index — no full-table scan.
 */
export async function getPendingSessions(
  clubId: string,
): Promise<TrainingSession[]> {
  return db.trainingSessions
    .where("[clubId+syncStatus]")
    .equals([clubId, "pending" satisfies SyncStatus])
    .sortBy("createdAt");
}

/**
 * Returns all sessions for a specific athlete within a club, sorted by date ascending.
 * Used for offline ACWR history display and athlete detail views.
 * Uses the compound [clubId+athleteId] index.
 */
export async function getSessionsByAthlete(
  clubId: string,
  athleteId: string,
): Promise<TrainingSession[]> {
  return db.trainingSessions
    .where("[clubId+athleteId]")
    .equals([clubId, athleteId])
    .sortBy("date");
}

/**
 * Returns a single session by its client-assigned localId.
 */
export async function getSessionByLocalId(
  localId: string,
): Promise<TrainingSession | undefined> {
  return db.trainingSessions.get(localId);
}

/**
 * Transitions a session to syncStatus="syncing".
 * Called by the sync worker immediately before issuing the API request,
 * preventing duplicate in-flight requests if the worker is triggered concurrently.
 */
export async function markSessionSyncing(localId: string): Promise<void> {
  await db.trainingSessions.update(localId, {
    syncStatus: "syncing" as SyncStatus,
    updatedAt: Date.now(),
  });
}

/**
 * Transitions a session to syncStatus="synced" and records the server-assigned ID.
 * The serverId is the workload_metric.id returned by POST /api/workload/metrics.
 */
export async function markSessionSynced(
  localId: string,
  serverId: string,
): Promise<void> {
  await db.trainingSessions.update(localId, {
    syncStatus: "synced" as SyncStatus,
    serverId,
    syncError: null,
    updatedAt: Date.now(),
  });
}

/**
 * Transitions a session to syncStatus="error" and records the failure reason.
 * Error sessions are retried by resetErroredSessions() on the next connectivity event.
 */
export async function markSessionError(
  localId: string,
  error: string,
): Promise<void> {
  await db.trainingSessions.update(localId, {
    syncStatus: "error" as SyncStatus,
    syncError: error,
    updatedAt: Date.now(),
  });
}

/**
 * Resets all "error" sessions back to "pending" for a club.
 * Called by T-090 when connectivity is restored, allowing the sync worker
 * to retry previously failed uploads.
 *
 * @returns The number of sessions that were reset.
 */
export async function resetErroredSessions(clubId: string): Promise<number> {
  const errored = await db.trainingSessions
    .where("[clubId+syncStatus]")
    .equals([clubId, "error" satisfies SyncStatus])
    .toArray();

  if (errored.length === 0) return 0;

  const now = Date.now();
  await Dexie.waitFor(
    Promise.all(
      errored.map((s) =>
        db.trainingSessions.update(s.localId, {
          syncStatus: "pending" as SyncStatus,
          syncError: null,
          updatedAt: now,
        }),
      ),
    ),
  );

  return errored.length;
}

/**
 * Returns the count of sessions with syncStatus="pending" for a club.
 * Used to display a pending-upload badge in the UI.
 */
export async function countPendingSessions(clubId: string): Promise<number> {
  return db.trainingSessions
    .where("[clubId+syncStatus]")
    .equals([clubId, "pending" satisfies SyncStatus])
    .count();
}

/**
 * Returns sessions for a club within an inclusive date range.
 * Date strings must be ISO YYYY-MM-DD format.
 * Note: Dexie range queries on string dates work correctly because ISO format
 * is lexicographically sortable.
 */
export async function getSessionsInDateRange(
  clubId: string,
  fromDate: string,
  toDate: string,
): Promise<TrainingSession[]> {
  return db.trainingSessions
    .where("date")
    .between(fromDate, toDate, true, true)
    .filter((s) => s.clubId === clubId)
    .toArray();
}
