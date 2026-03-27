import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrainingSession } from "@/lib/db/types";

const {
  mockGetPendingSessions,
  mockMarkSessionSyncing,
  mockMarkSessionSynced,
  mockMarkSessionError,
  mockPostWorkloadMetric,
  mockDbTrainingSessions,
} = vi.hoisted(() => ({
  mockGetPendingSessions: vi.fn(),
  mockMarkSessionSyncing: vi.fn().mockResolvedValue(undefined),
  mockMarkSessionSynced: vi.fn().mockResolvedValue(undefined),
  mockMarkSessionError: vi.fn().mockResolvedValue(undefined),
  mockPostWorkloadMetric: vi.fn(),
  mockDbTrainingSessions: {
    where: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db/training-sessions.db", () => ({
  getPendingSessions: mockGetPendingSessions,
  markSessionSyncing: mockMarkSessionSyncing,
  markSessionSynced: mockMarkSessionSynced,
  markSessionError: mockMarkSessionError,
}));

vi.mock("@/lib/api/workload", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/workload")>();
  return {
    WorkloadApiError: original.WorkloadApiError,
    postWorkloadMetric: mockPostWorkloadMetric,
  };
});

vi.mock("@/lib/db/index", () => ({
  db: {
    trainingSessions: mockDbTrainingSessions,
  },
}));

import { flushPendingSessions, resetStuckSyncingSessions } from "./sync-worker";
import { WorkloadApiError } from "@/lib/api/workload";

const CLUB_ID = "club_aaaaaaaaaaaaaaaaaaa1";
const FAKE_TOKEN = "test-access-token";
const NO_DELAY = () => Promise.resolve();

const makeSession = (
  overrides: Partial<TrainingSession> = {},
): TrainingSession => ({
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
});

const SERVER_RESPONSE = {
  id: "metric_server_001",
  athleteId: "athlete_001",
  date: "2024-06-01",
  rpe: 7,
  durationMinutes: 60,
  trainingLoadAu: 420,
  sessionType: "TRAINING",
  notes: null,
  createdAt: "2024-06-01T10:00:00.000Z",
};

const getAccessToken = vi.fn().mockResolvedValue(FAKE_TOKEN);

beforeEach(() => {
  vi.clearAllMocks();
  getAccessToken.mockResolvedValue(FAKE_TOKEN);
  mockPostWorkloadMetric.mockResolvedValue(SERVER_RESPONSE);
  mockMarkSessionSyncing.mockResolvedValue(undefined);
  mockMarkSessionSynced.mockResolvedValue(undefined);
  mockMarkSessionError.mockResolvedValue(undefined);
});

describe("flushPendingSessions", () => {
  it("returns { synced: 0, failed: 0, skipped: 0 } when no pending sessions", async () => {
    mockGetPendingSessions.mockResolvedValue([]);

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
    });

    expect(result).toEqual({ synced: 0, failed: 0, skipped: 0 });
    expect(mockPostWorkloadMetric).not.toHaveBeenCalled();
  });

  it("returns { skipped: N } when getAccessToken returns null", async () => {
    const sessions = [makeSession(), makeSession({ localId: "bb".repeat(16) })];
    mockGetPendingSessions.mockResolvedValue(sessions);
    getAccessToken.mockResolvedValue(null);

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
    });

    expect(result).toEqual({ synced: 0, failed: 0, skipped: 2 });
    expect(mockPostWorkloadMetric).not.toHaveBeenCalled();
  });

  it("calls postWorkloadMetric with correct payload including idempotencyKey = localId", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);

    await flushPendingSessions(CLUB_ID, { getAccessToken, delay: NO_DELAY });

    expect(mockPostWorkloadMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: session.athleteId,
        date: session.date,
        rpe: session.rpe,
        durationMinutes: session.durationMinutes,
        sessionType: session.sessionType,
        idempotencyKey: session.localId,
      }),
      FAKE_TOKEN,
    );
  });

  it("marks session as synced with server id on success", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);

    await flushPendingSessions(CLUB_ID, { getAccessToken, delay: NO_DELAY });

    expect(mockMarkSessionSynced).toHaveBeenCalledWith(
      session.localId,
      SERVER_RESPONSE.id,
    );
  });

  it("returns { synced: 2 } for two successful sessions", async () => {
    const s1 = makeSession();
    const s2 = makeSession({ localId: "cc".repeat(16) });
    mockGetPendingSessions.mockResolvedValue([s1, s2]);

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
    });

    expect(result).toEqual({ synced: 2, failed: 0, skipped: 0 });
  });

  it("non-retryable 400: marks error immediately, does not retry", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Bad request", 400, false),
    );

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(result).toEqual({ synced: 0, failed: 1, skipped: 0 });
    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(1);
    expect(mockMarkSessionError).toHaveBeenCalledWith(
      session.localId,
      expect.stringContaining("[non-retryable]"),
    );
  });

  it("non-retryable 404: marks error immediately, does not retry", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Atleta não encontrado", 404, false),
    );

    await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(1);
    expect(mockMarkSessionError).toHaveBeenCalledWith(
      session.localId,
      expect.stringContaining("404"),
    );
  });

  it("non-retryable 422: marks error immediately, does not retry", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Unprocessable entity", 422, false),
    );

    await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(1);
    expect(mockMarkSessionError).toHaveBeenCalledWith(
      session.localId,
      expect.stringContaining("[non-retryable]"),
    );
  });

  it("retryable 500: retries up to maxAttempts, marks error on exhaustion", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Internal Server Error", 500, true),
    );

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(result).toEqual({ synced: 0, failed: 1, skipped: 0 });
    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(3);
    expect(mockMarkSessionError).toHaveBeenCalledWith(
      session.localId,
      expect.stringContaining("[retryable]"),
    );
  });

  it("retryable 429: retries up to maxAttempts, marks error on exhaustion", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Too Many Requests", 429, true),
    );

    await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(3);
    expect(mockMarkSessionError).toHaveBeenCalledWith(
      session.localId,
      expect.stringContaining("[retryable]"),
    );
  });

  it("retryable 500: succeeds on second attempt → marks synced", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric
      .mockRejectedValueOnce(new WorkloadApiError("Server error", 500, true))
      .mockResolvedValueOnce(SERVER_RESPONSE);

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(result).toEqual({ synced: 1, failed: 0, skipped: 0 });
    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(2);
    expect(mockMarkSessionSynced).toHaveBeenCalledWith(
      session.localId,
      SERVER_RESPONSE.id,
    );
  });

  it("network error (fetch throws): retries up to maxAttempts, marks error", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric.mockRejectedValue(new TypeError("Failed to fetch"));

    await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(3);
    expect(mockMarkSessionError).toHaveBeenCalledWith(
      session.localId,
      expect.stringContaining("[network]"),
    );
  });

  it("network error: succeeds on second attempt → marks synced", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);
    mockPostWorkloadMetric
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(SERVER_RESPONSE);

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
      maxAttempts: 3,
    });

    expect(result).toEqual({ synced: 1, failed: 0, skipped: 0 });
    expect(mockMarkSessionSynced).toHaveBeenCalledWith(
      session.localId,
      SERVER_RESPONSE.id,
    );
  });

  it("mixed: session 1 succeeds, session 2 fails → { synced: 1, failed: 1 }", async () => {
    const s1 = makeSession({ localId: "aa".repeat(16) });
    const s2 = makeSession({ localId: "bb".repeat(16) });
    mockGetPendingSessions.mockResolvedValue([s1, s2]);
    mockPostWorkloadMetric
      .mockResolvedValueOnce(SERVER_RESPONSE)
      .mockRejectedValueOnce(new WorkloadApiError("Not found", 404, false));

    const result = await flushPendingSessions(CLUB_ID, {
      getAccessToken,
      delay: NO_DELAY,
    });

    expect(result).toEqual({ synced: 1, failed: 1, skipped: 0 });
  });

  it("markSessionSyncing called before each postWorkloadMetric call", async () => {
    const session = makeSession();
    mockGetPendingSessions.mockResolvedValue([session]);

    const callOrder: string[] = [];
    mockMarkSessionSyncing.mockImplementation(async () => {
      callOrder.push("syncing");
    });
    mockPostWorkloadMetric.mockImplementation(async () => {
      callOrder.push("post");
      return SERVER_RESPONSE;
    });

    await flushPendingSessions(CLUB_ID, { getAccessToken, delay: NO_DELAY });

    expect(callOrder.indexOf("syncing")).toBeLessThan(
      callOrder.indexOf("post"),
    );
  });

  it("sessions are processed independently (oldest-first order from getPendingSessions)", async () => {
    const s1 = makeSession({ localId: "aa".repeat(16), date: "2024-06-01" });
    const s2 = makeSession({ localId: "bb".repeat(16), date: "2024-06-02" });
    mockGetPendingSessions.mockResolvedValue([s1, s2]);

    const syncingOrder: string[] = [];
    mockMarkSessionSyncing.mockImplementation(async (id: string) => {
      syncingOrder.push(id);
    });

    await flushPendingSessions(CLUB_ID, { getAccessToken, delay: NO_DELAY });

    expect(syncingOrder[0]).toBe(s1.localId);
    expect(syncingOrder[1]).toBe(s2.localId);
  });
});

describe("resetStuckSyncingSessions", () => {
  it("returns 0 when no syncing sessions", async () => {
    const mockWhere = {
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    };
    mockDbTrainingSessions.where.mockReturnValue(mockWhere);

    const count = await resetStuckSyncingSessions(CLUB_ID);
    expect(count).toBe(0);
  });

  it("resets syncing sessions back to pending", async () => {
    const stuckSession = makeSession({
      localId: "aa".repeat(16),
      syncStatus: "syncing",
    });
    mockDbTrainingSessions.update.mockResolvedValue(undefined);
    const mockWhere = {
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([stuckSession]),
      }),
    };
    mockDbTrainingSessions.where.mockReturnValue(mockWhere);

    const count = await resetStuckSyncingSessions(CLUB_ID);

    expect(count).toBe(1);
    expect(mockDbTrainingSessions.update).toHaveBeenCalledWith(
      stuckSession.localId,
      expect.objectContaining({
        syncStatus: "pending",
        syncError: null,
      }),
    );
  });

  it("resets multiple stuck sessions", async () => {
    const stuckSessions = [
      makeSession({ localId: "aa".repeat(16), syncStatus: "syncing" }),
      makeSession({ localId: "bb".repeat(16), syncStatus: "syncing" }),
    ];
    mockDbTrainingSessions.update.mockResolvedValue(undefined);
    const mockWhere = {
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(stuckSessions),
      }),
    };
    mockDbTrainingSessions.where.mockReturnValue(mockWhere);

    const count = await resetStuckSyncingSessions(CLUB_ID);

    expect(count).toBe(2);
    expect(mockDbTrainingSessions.update).toHaveBeenCalledTimes(2);
  });

  it("queries with correct club+syncStatus compound index", async () => {
    const mockEquals = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    });
    const mockWhere = { equals: mockEquals };
    mockDbTrainingSessions.where.mockReturnValue(mockWhere);

    await resetStuckSyncingSessions(CLUB_ID);

    expect(mockDbTrainingSessions.where).toHaveBeenCalledWith(
      "[clubId+syncStatus]",
    );
    expect(mockEquals).toHaveBeenCalledWith([CLUB_ID, "syncing"]);
  });
});
