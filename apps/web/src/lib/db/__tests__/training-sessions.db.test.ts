import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClubOSDatabase } from "../index";
import type { CreateTrainingSessionInput } from "../types";
import {
  createLocalTrainingSession,
  getPendingSessions,
  getSessionsByAthlete,
  getSessionByLocalId,
  markSessionSyncing,
  markSessionSynced,
  markSessionError,
  resetErroredSessions,
  countPendingSessions,
  getSessionsInDateRange,
} from "../training-sessions.db";

let testDb: ClubOSDatabase;

const CLUB_A = "club_aaaaaaaaaaaaaaaaaaa1";
const CLUB_B = "club_bbbbbbbbbbbbbbbbbbb1";
const ATHLETE_1 = "athlete_xxxxxxxxxxxxxxxxx1";
const ATHLETE_2 = "athlete_xxxxxxxxxxxxxxxxx2";

function makeInput(
  overrides: Partial<CreateTrainingSessionInput> = {},
): CreateTrainingSessionInput {
  return {
    clubId: CLUB_A,
    athleteId: ATHLETE_1,
    date: "2025-03-25",
    rpe: 7,
    durationMinutes: 60,
    sessionType: "TRAINING",
    notes: null,
    ...overrides,
  };
}

beforeEach(async () => {
  testDb = new ClubOSDatabase();
  await testDb.open();
});

afterEach(async () => {
  await testDb.athletes.clear();
  await testDb.trainingSessions.clear();
  testDb.close();
});

describe("createLocalTrainingSession", () => {
  it("creates a session with syncStatus=pending", async () => {
    const session = await createLocalTrainingSession(makeInput());
    expect(session.syncStatus).toBe("pending");
  });

  it("sets serverId to null on creation", async () => {
    const session = await createLocalTrainingSession(makeInput());
    expect(session.serverId).toBeNull();
  });

  it("sets syncError to null on creation", async () => {
    const session = await createLocalTrainingSession(makeInput());
    expect(session.syncError).toBeNull();
  });

  it("generates a unique 32-character hex localId", async () => {
    const s1 = await createLocalTrainingSession(makeInput());
    const s2 = await createLocalTrainingSession(makeInput());
    expect(s1.localId).toHaveLength(32);
    expect(s2.localId).toHaveLength(32);
    expect(s1.localId).not.toBe(s2.localId);
    expect(s1.localId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("sets createdAt and updatedAt timestamps", async () => {
    const before = Date.now();
    const session = await createLocalTrainingSession(makeInput());
    const after = Date.now();
    expect(session.createdAt).toBeGreaterThanOrEqual(before);
    expect(session.createdAt).toBeLessThanOrEqual(after);
    expect(session.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("persists the session so it can be retrieved by localId", async () => {
    const session = await createLocalTrainingSession(makeInput());
    const fetched = await getSessionByLocalId(session.localId);
    expect(fetched).toBeDefined();
    expect(fetched?.localId).toBe(session.localId);
  });

  it("stores all input fields correctly", async () => {
    const input = makeInput({
      rpe: 9,
      durationMinutes: 90,
      sessionType: "MATCH",
      notes: "Test notes",
    });
    const session = await createLocalTrainingSession(input);
    expect(session.rpe).toBe(9);
    expect(session.durationMinutes).toBe(90);
    expect(session.sessionType).toBe("MATCH");
    expect(session.notes).toBe("Test notes");
  });
});

describe("getPendingSessions", () => {
  it("returns only pending sessions for the given club", async () => {
    await createLocalTrainingSession(makeInput());
    const s2 = await createLocalTrainingSession(makeInput());
    await markSessionSynced(s2.localId, "server_id_001");

    const pending = await getPendingSessions(CLUB_A);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.syncStatus).toBe("pending");
  });

  it("does not return sessions from other clubs", async () => {
    await createLocalTrainingSession(makeInput({ clubId: CLUB_A }));
    await createLocalTrainingSession(makeInput({ clubId: CLUB_B }));

    const pending = await getPendingSessions(CLUB_A);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.clubId).toBe(CLUB_A);
  });

  it("returns sessions sorted oldest-first (by createdAt)", async () => {
    const s1 = await createLocalTrainingSession(
      makeInput({ date: "2025-03-01" }),
    );
    await new Promise((r) => setTimeout(r, 5));
    const s2 = await createLocalTrainingSession(
      makeInput({ date: "2025-03-02" }),
    );

    const pending = await getPendingSessions(CLUB_A);
    expect(pending[0]?.localId).toBe(s1.localId);
    expect(pending[1]?.localId).toBe(s2.localId);
  });

  it("returns empty array when no pending sessions exist", async () => {
    const result = await getPendingSessions(CLUB_A);
    expect(result).toEqual([]);
  });
});

describe("getSessionsByAthlete", () => {
  it("returns sessions for the specified athlete only", async () => {
    await createLocalTrainingSession(makeInput({ athleteId: ATHLETE_1 }));
    await createLocalTrainingSession(makeInput({ athleteId: ATHLETE_2 }));

    const result = await getSessionsByAthlete(CLUB_A, ATHLETE_1);
    expect(result).toHaveLength(1);
    expect(result[0]?.athleteId).toBe(ATHLETE_1);
  });

  it("tenant isolation — does not return sessions from other clubs", async () => {
    await createLocalTrainingSession(
      makeInput({ clubId: CLUB_A, athleteId: ATHLETE_1 }),
    );
    await createLocalTrainingSession(
      makeInput({ clubId: CLUB_B, athleteId: ATHLETE_1 }),
    );

    const result = await getSessionsByAthlete(CLUB_A, ATHLETE_1);
    expect(result).toHaveLength(1);
    expect(result[0]?.clubId).toBe(CLUB_A);
  });

  it("returns empty array for an athlete with no sessions", async () => {
    const result = await getSessionsByAthlete(CLUB_A, "nonexistent_athlete");
    expect(result).toEqual([]);
  });
});

describe("markSessionSyncing", () => {
  it("transitions syncStatus from pending to syncing", async () => {
    const session = await createLocalTrainingSession(makeInput());
    await markSessionSyncing(session.localId);

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.syncStatus).toBe("syncing");
  });

  it("updates updatedAt timestamp", async () => {
    const session = await createLocalTrainingSession(makeInput());
    const originalUpdatedAt = session.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await markSessionSyncing(session.localId);

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.updatedAt).toBeGreaterThan(originalUpdatedAt);
  });
});

describe("markSessionSynced", () => {
  it("transitions syncStatus to synced", async () => {
    const session = await createLocalTrainingSession(makeInput());
    await markSessionSynced(session.localId, "server_wm_001");

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.syncStatus).toBe("synced");
  });

  it("sets serverId to the provided value", async () => {
    const session = await createLocalTrainingSession(makeInput());
    await markSessionSynced(session.localId, "server_wm_001");

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.serverId).toBe("server_wm_001");
  });

  it("clears any previous syncError", async () => {
    const session = await createLocalTrainingSession(makeInput());
    await markSessionError(session.localId, "previous error");
    await markSessionSynced(session.localId, "server_wm_001");

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.syncError).toBeNull();
  });
});

describe("markSessionError", () => {
  it("transitions syncStatus to error", async () => {
    const session = await createLocalTrainingSession(makeInput());
    await markSessionError(session.localId, "Network timeout");

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.syncStatus).toBe("error");
  });

  it("stores the error message in syncError", async () => {
    const session = await createLocalTrainingSession(makeInput());
    await markSessionError(session.localId, "404 Athlete not found");

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.syncError).toBe("404 Athlete not found");
  });
});

describe("resetErroredSessions", () => {
  it("resets all error sessions back to pending", async () => {
    const s1 = await createLocalTrainingSession(makeInput());
    const s2 = await createLocalTrainingSession(makeInput());
    await markSessionError(s1.localId, "err1");
    await markSessionError(s2.localId, "err2");

    const count = await resetErroredSessions(CLUB_A);
    expect(count).toBe(2);

    const u1 = await getSessionByLocalId(s1.localId);
    const u2 = await getSessionByLocalId(s2.localId);
    expect(u1?.syncStatus).toBe("pending");
    expect(u2?.syncStatus).toBe("pending");
  });

  it("clears syncError after reset", async () => {
    const session = await createLocalTrainingSession(makeInput());
    await markSessionError(session.localId, "previous error");
    await resetErroredSessions(CLUB_A);

    const updated = await getSessionByLocalId(session.localId);
    expect(updated?.syncError).toBeNull();
  });

  it("returns 0 when there are no errored sessions", async () => {
    const count = await resetErroredSessions(CLUB_A);
    expect(count).toBe(0);
  });

  it("only resets errored sessions for the given club", async () => {
    const sA = await createLocalTrainingSession(makeInput({ clubId: CLUB_A }));
    const sB = await createLocalTrainingSession(makeInput({ clubId: CLUB_B }));
    await markSessionError(sA.localId, "err");
    await markSessionError(sB.localId, "err");

    await resetErroredSessions(CLUB_A);

    const uA = await getSessionByLocalId(sA.localId);
    const uB = await getSessionByLocalId(sB.localId);
    expect(uA?.syncStatus).toBe("pending");
    expect(uB?.syncStatus).toBe("error");
  });

  it("does not affect pending or synced sessions", async () => {
    const pending = await createLocalTrainingSession(makeInput());
    const synced = await createLocalTrainingSession(makeInput());
    const errored = await createLocalTrainingSession(makeInput());

    await markSessionSynced(synced.localId, "srv_1");
    await markSessionError(errored.localId, "err");

    await resetErroredSessions(CLUB_A);

    expect((await getSessionByLocalId(pending.localId))?.syncStatus).toBe(
      "pending",
    );
    expect((await getSessionByLocalId(synced.localId))?.syncStatus).toBe(
      "synced",
    );
    expect((await getSessionByLocalId(errored.localId))?.syncStatus).toBe(
      "pending",
    );
  });
});

describe("countPendingSessions", () => {
  it("counts only pending sessions for a club", async () => {
    const s1 = await createLocalTrainingSession(makeInput());
    const s2 = await createLocalTrainingSession(makeInput());
    await markSessionSynced(s2.localId, "srv_1");

    const count = await countPendingSessions(CLUB_A);
    expect(count).toBe(1);

    void s1;
  });

  it("returns 0 for a club with no pending sessions", async () => {
    const count = await countPendingSessions(CLUB_A);
    expect(count).toBe(0);
  });

  it("tenant isolation — does not count sessions from other clubs", async () => {
    await createLocalTrainingSession(makeInput({ clubId: CLUB_A }));
    await createLocalTrainingSession(makeInput({ clubId: CLUB_B }));

    expect(await countPendingSessions(CLUB_A)).toBe(1);
    expect(await countPendingSessions(CLUB_B)).toBe(1);
  });
});

describe("getSessionsInDateRange", () => {
  beforeEach(async () => {
    await createLocalTrainingSession(makeInput({ date: "2025-03-01" }));
    await createLocalTrainingSession(makeInput({ date: "2025-03-15" }));
    await createLocalTrainingSession(makeInput({ date: "2025-03-31" }));
    await createLocalTrainingSession(makeInput({ date: "2025-04-10" }));
  });

  it("returns sessions within the inclusive date range", async () => {
    const result = await getSessionsInDateRange(
      CLUB_A,
      "2025-03-01",
      "2025-03-31",
    );
    expect(result).toHaveLength(3);
  });

  it("excludes sessions outside the date range", async () => {
    const result = await getSessionsInDateRange(
      CLUB_A,
      "2025-03-10",
      "2025-03-20",
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.date).toBe("2025-03-15");
  });

  it("tenant isolation — only returns sessions for the given club", async () => {
    await createLocalTrainingSession(
      makeInput({ clubId: CLUB_B, date: "2025-03-15" }),
    );
    const result = await getSessionsInDateRange(
      CLUB_A,
      "2025-03-01",
      "2025-03-31",
    );
    expect(result.every((s) => s.clubId === CLUB_A)).toBe(true);
  });
});
