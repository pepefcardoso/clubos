import { getDb } from "./index";
import type { PosQueueEntry } from "./types";

export async function createPosEntry(
  entry: Omit
    PosQueueEntry,
    "localId" | "syncStatus" | "syncError" | "serverId" | "gatewayMeta" | "createdAt" | "updatedAt"
  >,
): Promise<PosQueueEntry> {
  const now = Date.now();
  const record: PosQueueEntry = {
    ...entry,
    localId: crypto.randomUUID(),
    syncStatus: "pending",
    syncError: null,
    serverId: null,
    gatewayMeta: null,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().posQueue.add(record);
  return record;
}

export function getPosSalesForEvent(
  clubId: string,
  eventId: string,
): Promise<PosQueueEntry[]> {
  return getDb()
    .posQueue.where("[clubId+eventId]")
    .equals([clubId, eventId])
    .reverse()
    .sortBy("createdAt");
}

export function getPendingPosSales(clubId: string): Promise<PosQueueEntry[]> {
  return getDb()
    .posQueue.where("[clubId+syncStatus]")
    .equals([clubId, "pending"])
    .toArray();
}

export async function markPosSyncing(localId: string): Promise<void> {
  await getDb().posQueue.update(localId, {
    syncStatus: "syncing",
    updatedAt: Date.now(),
  });
}

export async function markPosSynced(
  localId: string,
  serverId: string,
  gatewayMeta: Record<string, unknown> | null,
): Promise<void> {
  await getDb().posQueue.update(localId, {
    syncStatus: "synced",
    serverId,
    gatewayMeta,
    updatedAt: Date.now(),
  });
}

export async function markPosError(
  localId: string,
  error: string,
): Promise<void> {
  await getDb().posQueue.update(localId, {
    syncStatus: "error",
    syncError: error,
    updatedAt: Date.now(),
  });
}

export async function resetErroredPosSales(clubId: string): Promise<number> {
  const errored = await getDb()
    .posQueue.where("[clubId+syncStatus]")
    .equals([clubId, "error"])
    .toArray();
  const now = Date.now();
  await Promise.all(
    errored.map((e) =>
      getDb().posQueue.update(e.localId, {
        syncStatus: "pending",
        syncError: null,
        updatedAt: now,
      }),
    ),
  );
  return errored.length;
}

export async function resetStuckPosSales(clubId: string): Promise<number> {
  const stuck = await getDb()
    .posQueue.where("[clubId+syncStatus]")
    .equals([clubId, "syncing"])
    .toArray();
  const now = Date.now();
  await Promise.all(
    stuck.map((e) =>
      getDb().posQueue.update(e.localId, {
        syncStatus: "pending",
        syncError: null,
        updatedAt: now,
      }),
    ),
  );
  return stuck.length;
}