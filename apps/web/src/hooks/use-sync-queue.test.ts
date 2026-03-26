import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrainingSession } from "@/lib/db/types";

const {
  mockGetAccessToken,
  mockAddTrainingSession,
  mockGetPending,
  mockSetSyncing,
  mockSetSynced,
  mockSetError,
  mockPostWorkloadMetric,
  mockIsOnline,
} = vi.hoisted(() => {
  const mockIsOnline = { value: true };
  return {
    mockGetAccessToken: vi.fn(),
    mockAddTrainingSession: vi.fn(),
    mockGetPending: vi.fn(),
    mockSetSyncing: vi.fn().mockResolvedValue(undefined),
    mockSetSynced: vi.fn().mockResolvedValue(undefined),
    mockSetError: vi.fn().mockResolvedValue(undefined),
    mockPostWorkloadMetric: vi.fn(),
    mockIsOnline,
  };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    getAccessToken: mockGetAccessToken,
    user: { clubId: "testclubid0000000001", id: "user_1", role: "ADMIN" },
  }),
}));

vi.mock("@/hooks/use-local-db", () => ({
  useLocalDb: () => ({
    addTrainingSession: mockAddTrainingSession,
    getPending: mockGetPending,
    setSyncing: mockSetSyncing,
    setSynced: mockSetSynced,
    setError: mockSetError,
    pendingCount: vi.fn().mockResolvedValue(0),
  }),
}));

vi.mock("@/hooks/use-network-status", () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline.value }),
}));

vi.mock("@/lib/api/workload", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/workload")>();
  return {
    WorkloadApiError: original.WorkloadApiError,
    postWorkloadMetric: mockPostWorkloadMetric,
  };
});

import { renderHook, act, waitFor } from "@testing-library/react";
import { useSyncQueue } from "./use-sync-queue";
import { WorkloadApiError } from "@/lib/api/workload";

const FAKE_TOKEN = "test-access-token";

const FAKE_SESSION: TrainingSession = {
  localId: "aabbccddeeff00112233445566778899",
  clubId: "testclubid0000000001",
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
};

const VALID_INPUT = {
  athleteId: "athlete_001",
  date: "2024-06-01",
  rpe: 7,
  durationMinutes: 60,
  sessionType: "TRAINING" as const,
};

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

beforeEach(() => {
  vi.clearAllMocks();
  mockIsOnline.value = true;
  mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
  mockAddTrainingSession.mockResolvedValue(FAKE_SESSION);
  mockGetPending.mockResolvedValue([]);
  mockPostWorkloadMetric.mockResolvedValue(SERVER_RESPONSE);

  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => mockIsOnline.value,
  });
});

describe("record()", () => {
  it("saves session to IndexedDB and returns it immediately", async () => {
    const { result } = renderHook(() => useSyncQueue());

    let session!: TrainingSession;
    await act(async () => {
      session = await result.current.record(VALID_INPUT);
    });

    expect(mockAddTrainingSession).toHaveBeenCalledWith(
      expect.objectContaining({
        athleteId: "athlete_001",
        rpe: 7,
        durationMinutes: 60,
      }),
    );
    expect(session).toEqual(FAKE_SESSION);
  });

  it("saved session has syncStatus=pending", async () => {
    const { result } = renderHook(() => useSyncQueue());

    let session!: TrainingSession;
    await act(async () => {
      session = await result.current.record(VALID_INPUT);
    });

    expect(session.syncStatus).toBe("pending");
  });

  it("attempts immediate sync when online", async () => {
    mockIsOnline.value = true;
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => {
      expect(mockSetSyncing).toHaveBeenCalledWith(FAKE_SESSION.localId);
    });
  });

  it("does NOT attempt sync when offline — leaves session as pending", async () => {
    mockIsOnline.value = false;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    expect(mockSetSyncing).not.toHaveBeenCalled();
    expect(mockPostWorkloadMetric).not.toHaveBeenCalled();
  });

  it("throws when user is unauthenticated (no clubId)", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    vi.mocked(useAuth).mockReturnValueOnce({
      user: null,
      getAccessToken: mockGetAccessToken,
      isAuthenticated: false,
      isLoading: false,
      accessToken: null,
      login: vi.fn(),
      logout: vi.fn(),
    });

    const { result } = renderHook(() => useSyncQueue());

    await expect(result.current.record(VALID_INPUT)).rejects.toThrow(
      "Cannot record workload: user is not authenticated",
    );
  });

  it("passes notes as null when not provided", async () => {
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    expect(mockAddTrainingSession).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });

  it("passes provided notes to addTrainingSession", async () => {
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record({
        ...VALID_INPUT,
        notes: "Pre-season warmup",
      });
    });

    expect(mockAddTrainingSession).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "Pre-season warmup" }),
    );
  });
});

describe("attemptSync() — online success path", () => {
  it("calls markSessionSyncing() before the API call", async () => {
    const callOrder: string[] = [];
    mockSetSyncing.mockImplementation(async () => {
      callOrder.push("syncing");
    });
    mockPostWorkloadMetric.mockImplementation(async () => {
      callOrder.push("post");
      return SERVER_RESPONSE;
    });

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => expect(callOrder).toContain("post"));
    expect(callOrder.indexOf("syncing")).toBeLessThan(
      callOrder.indexOf("post"),
    );
  });

  it("calls postWorkloadMetric with idempotencyKey equal to localId", async () => {
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => {
      expect(mockPostWorkloadMetric).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: FAKE_SESSION.localId }),
        FAKE_TOKEN,
      );
    });
  });

  it("calls markSessionSynced() with the server-returned ID on success", async () => {
    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => {
      expect(mockSetSynced).toHaveBeenCalledWith(
        FAKE_SESSION.localId,
        SERVER_RESPONSE.id,
      );
    });
  });
});

describe("attemptSync() — failure path", () => {
  it("calls markSessionError() when the API returns a 4xx error", async () => {
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Atleta não encontrado", 404, false),
    );

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(
        FAKE_SESSION.localId,
        expect.stringContaining("404"),
      );
    });
  });

  it("calls markSessionError() when the API returns a 5xx error", async () => {
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Internal Server Error", 500, true),
    );

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(
        FAKE_SESSION.localId,
        expect.stringContaining("500"),
      );
    });
  });

  it("calls markSessionError() when fetch throws a network error", async () => {
    mockPostWorkloadMetric.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => {
      expect(mockSetError).toHaveBeenCalledWith(
        FAKE_SESSION.localId,
        "Failed to fetch",
      );
    });
  });

  it("does NOT call markSessionSynced() on failure", async () => {
    mockPostWorkloadMetric.mockRejectedValue(
      new WorkloadApiError("Unprocessable", 422, false),
    );

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.record(VALID_INPUT);
    });

    await waitFor(() => expect(mockSetError).toHaveBeenCalled());
    expect(mockSetSynced).not.toHaveBeenCalled();
  });
});

describe("flushPending()", () => {
  it("syncs all pending sessions in order", async () => {
    const session2: TrainingSession = {
      ...FAKE_SESSION,
      localId: "ff".repeat(16),
    };
    mockGetPending.mockResolvedValue([FAKE_SESSION, session2]);

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.flushPending();
    });

    expect(mockPostWorkloadMetric).toHaveBeenCalledTimes(2);
    expect(mockSetSyncing).toHaveBeenNthCalledWith(1, FAKE_SESSION.localId);
    expect(mockSetSyncing).toHaveBeenNthCalledWith(2, session2.localId);
  });

  it("stops mid-flush when navigator.onLine becomes false", async () => {
    const sessions: TrainingSession[] = Array.from({ length: 3 }, (_, i) => ({
      ...FAKE_SESSION,
      localId: `${"aa".repeat(15)}0${i}`,
    }));
    mockGetPending.mockResolvedValue(sessions);

    let callCount = 0;
    mockSetSyncing.mockImplementation(async () => {
      callCount++;
      if (callCount >= 2) {
        Object.defineProperty(navigator, "onLine", {
          configurable: true,
          get: () => false,
        });
      }
    });

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.flushPending();
    });

    expect(mockSetSyncing).toHaveBeenCalledTimes(2);
  });

  it("concurrent calls do not trigger duplicate requests (isFlushing guard)", async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((r) => {
      resolveFirst = r;
    });

    mockGetPending.mockResolvedValueOnce([FAKE_SESSION]);
    mockSetSyncing.mockImplementationOnce(() => firstPromise);

    const { result } = renderHook(() => useSyncQueue());

    const flush1 = result.current.flushPending();
    const flush2 = result.current.flushPending();

    resolveFirst();
    await act(async () => {
      await Promise.all([flush1, flush2]);
    });

    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there are no pending sessions", async () => {
    mockGetPending.mockResolvedValue([]);

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.flushPending();
    });

    expect(mockSetSyncing).not.toHaveBeenCalled();
    expect(mockPostWorkloadMetric).not.toHaveBeenCalled();
  });

  it("does nothing when user has no clubId", async () => {
    const { useAuth } = await import("@/hooks/use-auth");
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      getAccessToken: mockGetAccessToken,
      isAuthenticated: false,
      isLoading: false,
      accessToken: null,
      login: vi.fn(),
      logout: vi.fn(),
    });

    const { result } = renderHook(() => useSyncQueue());

    await act(async () => {
      await result.current.flushPending();
    });

    expect(mockGetPending).not.toHaveBeenCalled();
  });
});

describe("auto-flush on reconnect", () => {
  it("calls flushPending() when isOnline transitions from false to true", async () => {
    mockIsOnline.value = false;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });

    const { rerender } = renderHook(() => useSyncQueue());

    mockIsOnline.value = true;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });

    await act(async () => {
      rerender();
    });

    await waitFor(() => {
      expect(mockGetPending).toHaveBeenCalled();
    });
  });

  it("does NOT call flushPending() when isOnline was already true (no flush on mount)", async () => {
    mockIsOnline.value = true;

    renderHook(() => useSyncQueue());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockGetPending).not.toHaveBeenCalled();
  });
});
