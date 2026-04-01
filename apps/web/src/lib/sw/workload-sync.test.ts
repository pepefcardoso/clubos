import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getPendingSessionsRaw,
  markSessionRaw,
  getActiveClubIdRaw,
  syncFromServiceWorker,
} from "./workload-sync";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("self", {
    location: { origin: "https://app.clubos.com.br" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const DB_NAME = "clubos-db";
const CLUB_ID = "club_aaaaaaaaaaaaaaaaaaa1";

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

function makeRawSession(overrides: Partial<RawSession> = {}): RawSession {
  return {
    localId: "aabbccddeeff00112233445566778899",
    clubId: CLUB_ID,
    athleteId: "athlete_001",
    date: "2024-06-01",
    rpe: 7,
    durationMinutes: 60,
    sessionType: "TRAINING",
    notes: null,
    syncStatus: "pending",
    syncError: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    serverId: null,
    ...overrides,
  };
}

/**
 * Directly inserts a record into the IDB via fake-indexeddb.
 * We set up the schema manually because workload-sync.ts uses raw IDB (no Dexie).
 */
function insertSessionRaw(session: RawSession): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("trainingSessions")) {
        const store = db.createObjectStore("trainingSessions", {
          keyPath: "localId",
        });
        store.createIndex("[clubId+syncStatus]", ["clubId", "syncStatus"]);
        store.createIndex("[clubId+athleteId]", ["clubId", "athleteId"]);
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("trainingSessions", "readwrite");
      tx.objectStore("trainingSessions").put(session);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function insertMetaRaw(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("trainingSessions")) {
        const store = db.createObjectStore("trainingSessions", {
          keyPath: "localId",
        });
        store.createIndex("[clubId+syncStatus]", ["clubId", "syncStatus"]);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function getSessionRaw(localId: string): Promise<RawSession | undefined> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("trainingSessions", "readonly");
      const getReq = tx.objectStore("trainingSessions").get(localId);
      getReq.onsuccess = () => resolve(getReq.result as RawSession | undefined);
      getReq.onerror = () => reject(getReq.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function mockFetch(status: number, body?: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

function mockFetchSequence(
  ...responses: Array<{ status: number; body?: unknown }>
) {
  let mock = vi.mocked(fetch);
  for (const { status, body } of responses) {
    mock = mock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
  }
}

describe("getPendingSessionsRaw", () => {
  it("returns empty array when no sessions exist", async () => {
    const result = await getPendingSessionsRaw(CLUB_ID);
    expect(result).toEqual([]);
  });

  it("returns only pending sessions for the given club", async () => {
    await insertSessionRaw(makeRawSession({ syncStatus: "pending" }));
    await insertSessionRaw(
      makeRawSession({
        localId: "bb".repeat(16),
        syncStatus: "synced",
        serverId: "srv_1",
      }),
    );

    const result = await getPendingSessionsRaw(CLUB_ID);
    expect(result).toHaveLength(1);
    expect(result[0]?.syncStatus).toBe("pending");
  });

  it("does not return sessions from other clubs", async () => {
    await insertSessionRaw(
      makeRawSession({ localId: "cc".repeat(16), clubId: "club_other_1" }),
    );

    const result = await getPendingSessionsRaw(CLUB_ID);
    const fromOther = result.filter((s) => s.clubId !== CLUB_ID);
    expect(fromOther).toHaveLength(0);
  });
});

describe("markSessionRaw", () => {
  it("updates syncStatus", async () => {
    const session = makeRawSession({ localId: "mark".padEnd(32, "0") });
    await insertSessionRaw(session);

    await markSessionRaw(session.localId, "syncing");

    const updated = await getSessionRaw(session.localId);
    expect(updated?.syncStatus).toBe("syncing");
  });

  it("sets serverId when provided", async () => {
    const session = makeRawSession({ localId: "srv".padEnd(32, "0") });
    await insertSessionRaw(session);

    await markSessionRaw(session.localId, "synced", "server-id-001");

    const updated = await getSessionRaw(session.localId);
    expect(updated?.syncStatus).toBe("synced");
    expect(updated?.serverId).toBe("server-id-001");
  });

  it("is a no-op for an unknown localId", async () => {
    await expect(
      markSessionRaw("nonexistent".padEnd(32, "0"), "synced"),
    ).resolves.toBeUndefined();
  });
});

describe("getActiveClubIdRaw", () => {
  it("returns null when meta store has no activeClubId", async () => {
    const result = await getActiveClubIdRaw();
    expect(result).toBeNull();
  });

  it("returns the stored clubId", async () => {
    await insertMetaRaw("activeClubId", CLUB_ID);
    const result = await getActiveClubIdRaw();
    expect(result).toBe(CLUB_ID);
  });

  it("returns null when activeClubId is null", async () => {
    await insertMetaRaw("activeClubId", null);
    const result = await getActiveClubIdRaw();
    expect(result).toBeNull();
  });
});

describe("syncFromServiceWorker", () => {
  it("returns { synced: 0, failed: 0 } when refresh token call fails", async () => {
    mockFetch(401);

    const result = await syncFromServiceWorker(CLUB_ID);
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it("returns { synced: 0, failed: 0 } when no pending sessions", async () => {
    mockFetch(200, { accessToken: "test-token" });

    const result = await syncFromServiceWorker(CLUB_ID);
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it("marks session as synced on 201 success", async () => {
    const session = makeRawSession({ localId: "sw01".padEnd(32, "0") });
    await insertSessionRaw(session);

    mockFetchSequence(
      { status: 200, body: { accessToken: "test-token" } },
      { status: 201, body: { id: "server-metric-1" } },
    );

    const result = await syncFromServiceWorker(CLUB_ID);
    expect(result).toEqual({ synced: 1, failed: 0 });

    const updated = await getSessionRaw(session.localId);
    expect(updated?.syncStatus).toBe("synced");
    expect(updated?.serverId).toBe("server-metric-1");
  });

  it("marks session as error on 4xx and counts as failed", async () => {
    const session = makeRawSession({ localId: "sw02".padEnd(32, "0") });
    await insertSessionRaw(session);

    mockFetchSequence(
      { status: 200, body: { accessToken: "test-token" } },
      { status: 422, body: { message: "Unprocessable" } },
    );

    const result = await syncFromServiceWorker(CLUB_ID);
    expect(result).toEqual({ synced: 0, failed: 1 });

    const updated = await getSessionRaw(session.localId);
    expect(updated?.syncStatus).toBe("error");
  });

  it("marks session as error when fetch throws (network error)", async () => {
    const session = makeRawSession({ localId: "sw03".padEnd(32, "0") });
    await insertSessionRaw(session);

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ accessToken: "test-token" }),
      } as Response)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await syncFromServiceWorker(CLUB_ID);
    expect(result).toEqual({ synced: 0, failed: 1 });

    const updated = await getSessionRaw(session.localId);
    expect(updated?.syncStatus).toBe("error");
  });

  it("processes multiple sessions: mixed success and failure", async () => {
    const s1 = makeRawSession({ localId: "sw04".padEnd(32, "0") });
    const s2 = makeRawSession({ localId: "sw05".padEnd(32, "0") });
    await insertSessionRaw(s1);
    await insertSessionRaw(s2);

    mockFetchSequence(
      { status: 200, body: { accessToken: "test-token" } },
      { status: 201, body: { id: "server-metric-ok" } },
      { status: 500, body: { message: "Server error" } },
    );

    const result = await syncFromServiceWorker(CLUB_ID);
    expect(result).toEqual({ synced: 1, failed: 1 });
  });

  it("sends the localId as idempotencyKey in the request body", async () => {
    const session = makeRawSession({ localId: "sw06".padEnd(32, "0") });
    await insertSessionRaw(session);

    mockFetchSequence(
      { status: 200, body: { accessToken: "test-token" } },
      { status: 201, body: { id: "server-metric-idem" } },
    );

    await syncFromServiceWorker(CLUB_ID);

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2);
    const [, postOptions] = calls[1] as [string, RequestInit];
    const body = JSON.parse(postOptions.body as string);
    expect(body.idempotencyKey).toBe(session.localId);
  });

  it("sends Authorization header with refreshed token", async () => {
    const session = makeRawSession({ localId: "sw07".padEnd(32, "0") });
    await insertSessionRaw(session);

    mockFetchSequence(
      { status: 200, body: { accessToken: "fresh-token-xyz" } },
      { status: 201, body: { id: "ok" } },
    );

    await syncFromServiceWorker(CLUB_ID);

    const calls = vi.mocked(fetch).mock.calls;
    const [, postOptions] = calls[1] as [string, RequestInit];
    expect(
      (postOptions.headers as Record<string, string>)["Authorization"],
    ).toBe("Bearer fresh-token-xyz");
  });
});
