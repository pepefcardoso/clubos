import { getDb } from "./index";
import type { FieldAccessQueueEntry, FieldAccessSyncStatus } from "./types";

/**
 * Creates a new offline scan entry with syncStatus="pending".
 * Uses `crypto.randomUUID()` (Web Crypto API — available in all modern browsers
 * and Service Worker context) to generate the localId, which becomes the
 * idempotencyKey sent to POST /api/events/:eventId/access/validate.
 */
export async function createLocalScan(
  input: Pick<
    FieldAccessQueueEntry,
    "clubId" | "eventId" | "token" | "scannedAt" | "localValid"
  >,
): Promise<FieldAccessQueueEntry> {
  const now = Date.now();
  const entry: FieldAccessQueueEntry = {
    localId: crypto.randomUUID(),
    ...input,
    syncStatus: "pending",
    syncError: null,
    serverId: null,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().fieldAccessQueue.add(entry);
  return entry;
}

/**
 * Returns all pending scans for a club, sorted oldest-first.
 * Primary feed for the offline sync worker.
 * Uses the compound [clubId+syncStatus] index — no full-table scan.
 */
export async function getPendingScans(
  clubId: string,
): Promise<FieldAccessQueueEntry[]> {
  return getDb()
    .fieldAccessQueue.where("[clubId+syncStatus]")
    .equals([clubId, "pending" satisfies FieldAccessSyncStatus])
    .sortBy("createdAt");
}

/**
 * Transitions a scan to syncStatus="syncing".
 * Called immediately before issuing the API request to prevent duplicate
 * in-flight submissions if the worker is triggered concurrently.
 */
export async function markScanSyncing(localId: string): Promise<void> {
  await getDb().fieldAccessQueue.update(localId, {
    syncStatus: "syncing" as FieldAccessSyncStatus,
    updatedAt: Date.now(),
  });
}

/**
 * Transitions a scan to syncStatus="synced" and records the server log ID.
 * `serverId` is the `accessLogId` returned by POST .../access/validate.
 */
export async function markScanSynced(
  localId: string,
  serverId: string,
): Promise<void> {
  await getDb().fieldAccessQueue.update(localId, {
    syncStatus: "synced" as FieldAccessSyncStatus,
    serverId,
    syncError: null,
    updatedAt: Date.now(),
  });
}

/**
 * Transitions a scan to syncStatus="error" and records the failure reason.
 */
export async function markScanError(
  localId: string,
  error: string,
): Promise<void> {
  await getDb().fieldAccessQueue.update(localId, {
    syncStatus: "error" as FieldAccessSyncStatus,
    syncError: error,
    updatedAt: Date.now(),
  });
}

/**
 * Returns all scans for a specific event and club, newest-first.
 * Used to populate the access log table on the scanner page.
 * Uses the compound [clubId+eventId] index.
 */
export async function getScansForEvent(
  clubId: string,
  eventId: string,
): Promise<FieldAccessQueueEntry[]> {
  const entries = await getDb()
    .fieldAccessQueue.where("[clubId+eventId]")
    .equals([clubId, eventId])
    .toArray();
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Returns the count of pending scans for a club.
 * Used to display a "pending uploads" badge in the UI.
 */
export async function countPendingScans(clubId: string): Promise<number> {
  return getDb()
    .fieldAccessQueue.where("[clubId+syncStatus]")
    .equals([clubId, "pending" satisfies FieldAccessSyncStatus])
    .count();
}

/**
 * Resets all "error" scans back to "pending" for a club.
 * Called on reconnection so the sync worker retries previously failed uploads.
 *
 * @returns The number of scans reset.
 */
export async function resetErroredScans(clubId: string): Promise<number> {
  const errored = await getDb()
    .fieldAccessQueue.where("[clubId+syncStatus]")
    .equals([clubId, "error" satisfies FieldAccessSyncStatus])
    .toArray();

  if (errored.length === 0) return 0;

  const now = Date.now();
  await Promise.all(
    errored.map((e) =>
      getDb().fieldAccessQueue.update(e.localId, {
        syncStatus: "pending" as FieldAccessSyncStatus,
        syncError: null,
        updatedAt: now,
      }),
    ),
  );

  return errored.length;
}

/**
 * Resets any scans stuck in "syncing" state back to "pending".
 * Called on app bootstrap to recover from a mid-sync crash.
 * Mirrors the pattern of resetStuckSyncingSessions in training-sessions.db.ts.
 */
export async function resetStuckSyncingScans(clubId: string): Promise<number> {
  const stuck = await getDb()
    .fieldAccessQueue.where("[clubId+syncStatus]")
    .equals([clubId, "syncing" satisfies FieldAccessSyncStatus])
    .toArray();

  if (stuck.length === 0) return 0;

  const now = Date.now();
  await Promise.all(
    stuck.map((e) =>
      getDb().fieldAccessQueue.update(e.localId, {
        syncStatus: "pending" as FieldAccessSyncStatus,
        syncError: null,
        updatedAt: now,
      }),
    ),
  );

  return stuck.length;
}
