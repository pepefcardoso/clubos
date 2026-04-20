import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClubOSDatabase } from "../index";
import type { FieldAccessQueueEntry } from "../types";

let testDb: ClubOSDatabase;

import {
  createLocalScan,
  getPendingScans,
  markScanSyncing,
  markScanSynced,
  markScanError,
  getScansForEvent,
  countPendingScans,
  resetErroredScans,
  resetStuckSyncingScans,
} from "../field-access.db";

const CLUB_A = "club_aaaaaaaaaaaaaaaaaaa1";
const CLUB_B = "club_bbbbbbbbbbbbbbbbbbb1";
const EVENT_1 = "event_xxxxxxxxxxxxxxxx01";
const EVENT_2 = "event_xxxxxxxxxxxxxxxx02";

function makeScanInput(
  overrides: Partial<
    Pick<
      FieldAccessQueueEntry,
      "clubId" | "eventId" | "token" | "scannedAt" | "localValid"
    >
  > = {},
) {
  return {
    clubId: CLUB_A,
    eventId: EVENT_1,
    token: "header.payload.signature",
    scannedAt: new Date().toISOString(),
    localValid: true,
    ...overrides,
  };
}

beforeEach(async () => {
  testDb = new ClubOSDatabase();
  await testDb.open();
});

afterEach(async () => {
  await testDb.fieldAccessQueue.clear();
  testDb.close();
});

describe("createLocalScan", () => {
  it("creates entry with syncStatus=pending", async () => {
    const entry = await createLocalScan(makeScanInput());
    expect(entry.syncStatus).toBe("pending");
  });

  it("sets serverId to null", async () => {
    const entry = await createLocalScan(makeScanInput());
    expect(entry.serverId).toBeNull();
  });

  it("sets syncError to null", async () => {
    const entry = await createLocalScan(makeScanInput());
    expect(entry.syncError).toBeNull();
  });

  it("generates a unique UUID localId for each scan", async () => {
    const a = await createLocalScan(makeScanInput());
    const b = await createLocalScan(makeScanInput());
    expect(a.localId).not.toBe(b.localId);
    expect(a.localId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("stores the provided token, clubId, eventId, and localValid", async () => {
    const input = makeScanInput({
      clubId: CLUB_A,
      eventId: EVENT_1,
      localValid: false,
    });
    const entry = await createLocalScan(input);
    expect(entry.clubId).toBe(CLUB_A);
    expect(entry.eventId).toBe(EVENT_1);
    expect(entry.token).toBe(input.token);
    expect(entry.localValid).toBe(false);
  });

  it("sets createdAt and updatedAt timestamps", async () => {
    const before = Date.now();
    const entry = await createLocalScan(makeScanInput());
    const after = Date.now();
    expect(entry.createdAt).toBeGreaterThanOrEqual(before);
    expect(entry.createdAt).toBeLessThanOrEqual(after);
    expect(entry.updatedAt).toBe(entry.createdAt);
  });

  it("persists entry so it can be retrieved later", async () => {
    const entry = await createLocalScan(makeScanInput());
    const stored = await testDb.fieldAccessQueue.get(entry.localId);
    expect(stored?.localId).toBe(entry.localId);
  });
});

describe("getPendingScans", () => {
  it("returns only pending entries for the given club", async () => {
    const p = await createLocalScan(makeScanInput());
    const s = await createLocalScan(makeScanInput());
    await markScanSynced(s.localId, "server_log_001");

    const pending = await getPendingScans(CLUB_A);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.localId).toBe(p.localId);
  });

  it("tenant isolation — does not return scans from another club", async () => {
    await createLocalScan(makeScanInput({ clubId: CLUB_A }));
    await createLocalScan(makeScanInput({ clubId: CLUB_B }));

    const result = await getPendingScans(CLUB_A);
    expect(result).toHaveLength(1);
    expect(result[0]?.clubId).toBe(CLUB_A);
  });

  it("returns entries sorted oldest-first by createdAt", async () => {
    const s1 = await createLocalScan(makeScanInput());
    await new Promise((r) => setTimeout(r, 5));
    const s2 = await createLocalScan(makeScanInput());

    const pending = await getPendingScans(CLUB_A);
    expect(pending[0]?.localId).toBe(s1.localId);
    expect(pending[1]?.localId).toBe(s2.localId);
  });

  it("returns empty array when no pending scans exist", async () => {
    expect(await getPendingScans(CLUB_A)).toEqual([]);
  });

  it("does not return 'error' status entries", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanError(entry.localId, "some error");

    expect(await getPendingScans(CLUB_A)).toHaveLength(0);
  });
});

describe("markScanSyncing", () => {
  it("transitions syncStatus to syncing", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanSyncing(entry.localId);

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.syncStatus).toBe("syncing");
  });

  it("updates the updatedAt timestamp", async () => {
    const entry = await createLocalScan(makeScanInput());
    const original = entry.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await markScanSyncing(entry.localId);

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.updatedAt).toBeGreaterThan(original);
  });
});

describe("markScanSynced", () => {
  it("transitions syncStatus to synced", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanSynced(entry.localId, "server_log_001");

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.syncStatus).toBe("synced");
  });

  it("sets the serverId to the provided value", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanSynced(entry.localId, "server_log_abc");

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.serverId).toBe("server_log_abc");
  });

  it("clears any previous syncError", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanError(entry.localId, "previous error");
    await markScanSynced(entry.localId, "server_log_001");

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.syncError).toBeNull();
  });
});

describe("markScanError", () => {
  it("transitions syncStatus to error", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanError(entry.localId, "Network timeout");

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.syncStatus).toBe("error");
  });

  it("stores the error message in syncError", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanError(entry.localId, "HTTP 404: Not Found");

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.syncError).toBe("HTTP 404: Not Found");
  });
});

describe("getScansForEvent", () => {
  it("returns only scans for the specified club + event", async () => {
    await createLocalScan(makeScanInput({ clubId: CLUB_A, eventId: EVENT_1 }));
    await createLocalScan(makeScanInput({ clubId: CLUB_A, eventId: EVENT_2 }));
    await createLocalScan(makeScanInput({ clubId: CLUB_B, eventId: EVENT_1 }));

    const result = await getScansForEvent(CLUB_A, EVENT_1);
    expect(result).toHaveLength(1);
    expect(result[0]?.eventId).toBe(EVENT_1);
    expect(result[0]?.clubId).toBe(CLUB_A);
  });

  it("returns entries sorted newest-first", async () => {
    const s1 = await createLocalScan(makeScanInput());
    await new Promise((r) => setTimeout(r, 5));
    const s2 = await createLocalScan(makeScanInput());

    const result = await getScansForEvent(CLUB_A, EVENT_1);
    expect(result[0]?.localId).toBe(s2.localId);
    expect(result[1]?.localId).toBe(s1.localId);
  });

  it("returns empty array for a club+event with no scans", async () => {
    expect(await getScansForEvent(CLUB_A, "event_unknown")).toEqual([]);
  });

  it("includes all sync statuses (pending, synced, error)", async () => {
    const pending = await createLocalScan(makeScanInput());
    const errored = await createLocalScan(makeScanInput());
    const synced = await createLocalScan(makeScanInput());
    await markScanError(errored.localId, "err");
    await markScanSynced(synced.localId, "srv_1");

    const result = await getScansForEvent(CLUB_A, EVENT_1);
    expect(result).toHaveLength(3);
    const statuses = result.map((e) => e.syncStatus).sort();
    expect(statuses).toEqual(["error", "pending", "synced"]);
    void pending;
  });
});

describe("countPendingScans", () => {
  it("counts only pending entries for the given club", async () => {
    const s1 = await createLocalScan(makeScanInput());
    await createLocalScan(makeScanInput());
    await markScanSynced(s1.localId, "srv_1");

    expect(await countPendingScans(CLUB_A)).toBe(1);
  });

  it("returns 0 when there are no pending scans", async () => {
    expect(await countPendingScans(CLUB_A)).toBe(0);
  });

  it("tenant isolation — does not count scans from other clubs", async () => {
    await createLocalScan(makeScanInput({ clubId: CLUB_A }));
    await createLocalScan(makeScanInput({ clubId: CLUB_B }));

    expect(await countPendingScans(CLUB_A)).toBe(1);
    expect(await countPendingScans(CLUB_B)).toBe(1);
  });
});

describe("resetErroredScans", () => {
  it("resets all error entries to pending for the given club", async () => {
    const s1 = await createLocalScan(makeScanInput());
    const s2 = await createLocalScan(makeScanInput());
    await markScanError(s1.localId, "err1");
    await markScanError(s2.localId, "err2");

    const count = await resetErroredScans(CLUB_A);
    expect(count).toBe(2);

    const u1 = await testDb.fieldAccessQueue.get(s1.localId);
    const u2 = await testDb.fieldAccessQueue.get(s2.localId);
    expect(u1?.syncStatus).toBe("pending");
    expect(u2?.syncStatus).toBe("pending");
  });

  it("clears syncError after reset", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanError(entry.localId, "previous error");
    await resetErroredScans(CLUB_A);

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.syncError).toBeNull();
  });

  it("returns 0 when there are no errored scans", async () => {
    expect(await resetErroredScans(CLUB_A)).toBe(0);
  });

  it("tenant isolation — only resets errors for the given club", async () => {
    const sA = await createLocalScan(makeScanInput({ clubId: CLUB_A }));
    const sB = await createLocalScan(makeScanInput({ clubId: CLUB_B }));
    await markScanError(sA.localId, "err");
    await markScanError(sB.localId, "err");

    await resetErroredScans(CLUB_A);

    const uA = await testDb.fieldAccessQueue.get(sA.localId);
    const uB = await testDb.fieldAccessQueue.get(sB.localId);
    expect(uA?.syncStatus).toBe("pending");
    expect(uB?.syncStatus).toBe("error");
  });

  it("does not affect pending or synced entries", async () => {
    const pending = await createLocalScan(makeScanInput());
    const synced = await createLocalScan(makeScanInput());
    const errored = await createLocalScan(makeScanInput());

    await markScanSynced(synced.localId, "srv_1");
    await markScanError(errored.localId, "err");
    await resetErroredScans(CLUB_A);

    expect(
      (await testDb.fieldAccessQueue.get(pending.localId))?.syncStatus,
    ).toBe("pending");
    expect(
      (await testDb.fieldAccessQueue.get(synced.localId))?.syncStatus,
    ).toBe("synced");
    expect(
      (await testDb.fieldAccessQueue.get(errored.localId))?.syncStatus,
    ).toBe("pending");
  });
});

describe("resetStuckSyncingScans", () => {
  it("returns 0 when no syncing entries exist", async () => {
    expect(await resetStuckSyncingScans(CLUB_A)).toBe(0);
  });

  it("resets stuck syncing entries back to pending", async () => {
    const entry = await createLocalScan(makeScanInput());
    await markScanSyncing(entry.localId);

    const count = await resetStuckSyncingScans(CLUB_A);
    expect(count).toBe(1);

    const updated = await testDb.fieldAccessQueue.get(entry.localId);
    expect(updated?.syncStatus).toBe("pending");
    expect(updated?.syncError).toBeNull();
  });

  it("tenant isolation — only resets syncing entries for the given club", async () => {
    const sA = await createLocalScan(makeScanInput({ clubId: CLUB_A }));
    const sB = await createLocalScan(makeScanInput({ clubId: CLUB_B }));
    await markScanSyncing(sA.localId);
    await markScanSyncing(sB.localId);

    await resetStuckSyncingScans(CLUB_A);

    expect((await testDb.fieldAccessQueue.get(sA.localId))?.syncStatus).toBe(
      "pending",
    );
    expect((await testDb.fieldAccessQueue.get(sB.localId))?.syncStatus).toBe(
      "syncing",
    );
  });
});

describe("Dexie v4 migration — existing stores preserved", () => {
  it("athletes store is still accessible after v4 migration", async () => {
    const athlete = {
      id: "ath_v4_test",
      clubId: CLUB_A,
      name: "Migration Athlete",
      birthDate: "1990-01-01",
      position: null,
      status: "ACTIVE" as const,
      cachedAt: Date.now(),
    };
    await testDb.athletes.put(athlete);
    const result = await testDb.athletes.get("ath_v4_test");
    expect(result?.name).toBe("Migration Athlete");
  });

  it("trainingSessions store is still accessible after v4 migration", async () => {
    const session = {
      localId: "local_v4_test",
      clubId: CLUB_A,
      athleteId: "ath_001",
      date: "2025-01-01",
      rpe: 7,
      durationMinutes: 60,
      sessionType: "TRAINING" as const,
      notes: null,
      syncStatus: "pending" as const,
      syncError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      serverId: null,
    };
    await testDb.trainingSessions.put(session);
    const result = await testDb.trainingSessions.get("local_v4_test");
    expect(result?.localId).toBe("local_v4_test");
  });
});
