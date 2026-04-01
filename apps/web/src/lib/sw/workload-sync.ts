/**
 * IMPORTANT: This file must NOT import React, Dexie, or any module that
 * references `window`. It runs in the SW global scope where `window` is
 * undefined. All IDB access uses the native IndexedDB API.
 *
 * Called by the `sync` event handler in sw.ts when no browser clients are open
 * (app is backgrounded or the tab is closed).
 */

const DB_NAME = "clubos-db";
const SESSIONS_STORE = "trainingSessions";
const META_STORE = "meta";

interface RawSession {
  localId: string;
  clubId: string;
  athleteId: string;
  date: string;
  rpe: number;
  durationMinutes: number;
  sessionType: string;
  notes: string | null;
  syncStatus: string;
  syncError: string | null;
  createdAt: number;
  updatedAt: number;
  serverId: string | null;
}

interface WorkloadMetricResponse {
  id: string;
}

/**
 * Reads all pending sessions for a club using the [clubId+syncStatus] compound index.
 * Uses the same key path as the Dexie v1 schema so results are consistent.
 */
export function getPendingSessionsRaw(clubId: string): Promise<RawSession[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(SESSIONS_STORE, "readonly");
      const store = tx.objectStore(SESSIONS_STORE);
      const index = store.index("[clubId+syncStatus]");
      const range = IDBKeyRange.only([clubId, "pending"]);
      const getAll = index.getAll(range);
      getAll.onsuccess = () => resolve((getAll.result as RawSession[]) ?? []);
      getAll.onerror = () => reject(getAll.error);
    };
  });
}

/**
 * Updates a session's syncStatus (and optionally serverId) directly via IDB.
 * Mirrors the behaviour of markSessionSyncing / markSessionSynced / markSessionError
 * from training-sessions.db.ts, but without Dexie.
 */
export function markSessionRaw(
  localId: string,
  status: string,
  serverId?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        resolve();
        return;
      }
      const tx = db.transaction(SESSIONS_STORE, "readwrite");
      const store = tx.objectStore(SESSIONS_STORE);
      const getReq = store.get(localId);
      getReq.onsuccess = () => {
        const record = getReq.result as RawSession | undefined;
        if (!record) {
          resolve();
          return;
        }
        record.syncStatus = status;
        record.updatedAt = Date.now();
        if (serverId !== undefined) {
          record.serverId = serverId;
        }
        store.put(record);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

/**
 * Reads the activeClubId from the meta IDB store without Dexie.
 * Returns null if the store doesn't exist or the key is absent.
 *
 * The meta store is written by auth.context.tsx via meta.db.ts (Dexie) whenever
 * the user authenticates, so the SW can discover the current club without a JWT.
 */
export function getActiveClubIdRaw(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(META_STORE, "readonly");
      const store = tx.objectStore(META_STORE);
      const getReq = store.get("activeClubId");
      getReq.onsuccess = () =>
        resolve((getReq.result?.value as string) ?? null);
      getReq.onerror = () => resolve(null);
    };
  });
}

/**
 * Obtains a fresh access token by calling the refresh endpoint with the
 * httpOnly refresh-token cookie. Returns null if the user is logged out
 * or the cookie has expired.
 *
 * This is the only network call that does not require an existing token.
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const origin =
      typeof self !== "undefined" && "location" in self
        ? self.location.origin
        : "";
    const res = await fetch(`${origin}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken?: string };
    return body.accessToken ?? null;
  } catch {
    return null;
  }
}

export interface SwSyncResult {
  synced: number;
  failed: number;
}

/**
 * Syncs all pending sessions for a club from Service Worker context.
 *
 * Called when the `sync` event fires and no browser clients are open.
 * Uses fetch + raw IDB — zero React, zero Dexie.
 *
 * Design:
 * - Refreshes the access token via cookie before attempting any fetch.
 * - Processes sessions sequentially (same as flushPendingSessions in sync-worker.ts).
 * - Uses localId as idempotencyKey — safe to retry; server deduplicates.
 * - Non-retryable 4xx: marks error immediately.
 * - Retryable 5xx / network: marks error (next sync event will retry via
 *   resetErroredSessions on the client side).
 */
export async function syncFromServiceWorker(
  clubId: string,
): Promise<SwSyncResult> {
  const token = await refreshAccessToken();
  if (!token) return { synced: 0, failed: 0 };

  const sessions = await getPendingSessionsRaw(clubId);
  if (sessions.length === 0) return { synced: 0, failed: 0 };

  const origin =
    typeof self !== "undefined" && "location" in self
      ? self.location.origin
      : "";

  let synced = 0;
  let failed = 0;

  for (const session of sessions) {
    await markSessionRaw(session.localId, "syncing");

    try {
      const res = await fetch(`${origin}/api/workload/metrics`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          athleteId: session.athleteId,
          date: session.date,
          rpe: session.rpe,
          durationMinutes: session.durationMinutes,
          sessionType: session.sessionType,
          notes: session.notes ?? undefined,
          idempotencyKey: session.localId,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as WorkloadMetricResponse;
        await markSessionRaw(session.localId, "synced", data.id);
        synced++;
      } else {
        await markSessionRaw(session.localId, "error");
        failed++;
      }
    } catch {
      await markSessionRaw(session.localId, "error");
      failed++;
    }
  }

  return { synced, failed };
}
