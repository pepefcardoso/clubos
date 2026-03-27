import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const {
  mockGetAccessToken,
  mockFlushPendingSessions,
  mockResetErroredSessions,
  mockResetStuckSyncingSessions,
  mockIsOnline,
  mockUser,
} = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn().mockResolvedValue("test-token"),
  mockFlushPendingSessions: vi
    .fn()
    .mockResolvedValue({ synced: 0, failed: 0, skipped: 0 }),
  mockResetErroredSessions: vi.fn().mockResolvedValue(0),
  mockResetStuckSyncingSessions: vi.fn().mockResolvedValue(0),
  mockIsOnline: { value: true },
  mockUser: {
    value: {
      id: "user_001",
      email: "admin@club.com",
      role: "ADMIN" as const,
      clubId: "club_aaaaaaaaaaaaaaaaaaa1",
    },
  },
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: mockUser.value,
    getAccessToken: mockGetAccessToken,
    isAuthenticated: true,
    isLoading: false,
    accessToken: "test-token",
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-network-status", () => ({
  useNetworkStatus: () => ({ isOnline: mockIsOnline.value }),
}));

vi.mock("@/lib/sync/sync-worker", () => ({
  flushPendingSessions: mockFlushPendingSessions,
  resetStuckSyncingSessions: mockResetStuckSyncingSessions,
}));

vi.mock("@/lib/db/training-sessions.db", () => ({
  resetErroredSessions: mockResetErroredSessions,
}));

import { useSyncWorker } from "./use-sync-worker";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsOnline.value = true;
  mockUser.value = {
    id: "user_001",
    email: "admin@club.com",
    role: "ADMIN",
    clubId: "club_aaaaaaaaaaaaaaaaaaa1",
  };
  mockGetAccessToken.mockResolvedValue("test-token");
  mockFlushPendingSessions.mockResolvedValue({
    synced: 0,
    failed: 0,
    skipped: 0,
  });
  mockResetErroredSessions.mockResolvedValue(0);
  mockResetStuckSyncingSessions.mockResolvedValue(0);
});

describe("useSyncWorker", () => {
  it("isSyncing is false on initial render", () => {
    mockFlushPendingSessions.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSyncWorker());
    expect(result.current.isSyncing).toBe(false);
  });

  it("calls flushPendingSessions when mounted with isOnline=true", async () => {
    mockIsOnline.value = true;
    renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(mockFlushPendingSessions).toHaveBeenCalled();
    });
  });

  it("does NOT call flushPendingSessions when isOnline is false", async () => {
    mockIsOnline.value = false;
    renderHook(() => useSyncWorker());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(mockFlushPendingSessions).not.toHaveBeenCalled();
  });

  it("sets isSyncing=true during flush, false after", async () => {
    let resolveFlush!: () => void;
    mockFlushPendingSessions.mockReturnValue(
      new Promise<{ synced: number; failed: number; skipped: number }>((r) => {
        resolveFlush = () => r({ synced: 1, failed: 0, skipped: 0 });
      }),
    );

    const { result } = renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(result.current.isSyncing).toBe(true);
    });

    await act(async () => {
      resolveFlush();
    });

    expect(result.current.isSyncing).toBe(false);
  });

  it("sets lastSyncAt after successful flush", async () => {
    const before = new Date();
    renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(mockFlushPendingSessions).toHaveBeenCalled();
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const { result } = renderHook(() => useSyncWorker());
    await waitFor(() => {
      expect(mockFlushPendingSessions).toHaveBeenCalled();
    });

    expect(before).toBeInstanceOf(Date);
  });

  it("sets lastSyncResult with synced/failed counts", async () => {
    mockFlushPendingSessions.mockResolvedValue({
      synced: 3,
      failed: 1,
      skipped: 0,
    });

    const { result } = renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(result.current.lastSyncResult).toEqual({ synced: 3, failed: 1 });
    });
  });

  it("does not throw if flushPendingSessions rejects (non-fatal)", async () => {
    mockFlushPendingSessions.mockRejectedValue(new Error("IDB unavailable"));

    expect(() => {
      renderHook(() => useSyncWorker());
    }).not.toThrow();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  });

  it("prevents concurrent flushes (second call while first is in flight is no-op)", async () => {
    let resolveFirst!: () => void;
    mockFlushPendingSessions.mockReturnValueOnce(
      new Promise<{ synced: number; failed: number; skipped: number }>((r) => {
        resolveFirst = () => r({ synced: 0, failed: 0, skipped: 0 });
      }),
    );

    const { result } = renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(result.current.isSyncing).toBe(true);
    });

    act(() => {
      result.current.triggerSync();
    });

    expect(mockFlushPendingSessions).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst();
    });
  });

  it("triggerSync() manually triggers a flush", async () => {
    mockFlushPendingSessions.mockResolvedValue({
      synced: 0,
      failed: 0,
      skipped: 0,
    });

    const { result } = renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(result.current.isSyncing).toBe(false);
    });

    const callsBefore = mockFlushPendingSessions.mock.calls.length;

    await act(async () => {
      result.current.triggerSync();
    });

    await waitFor(() => {
      expect(mockFlushPendingSessions.mock.calls.length).toBeGreaterThan(
        callsBefore,
      );
    });
  });

  it("does not flush when user.clubId is null/undefined", async () => {
    mockUser.value = null as unknown as typeof mockUser.value;

    renderHook(() => useSyncWorker());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(mockFlushPendingSessions).not.toHaveBeenCalled();
  });

  it("calls resetErroredSessions before flushPendingSessions", async () => {
    const callOrder: string[] = [];
    mockResetErroredSessions.mockImplementation(async () => {
      callOrder.push("reset");
      return 0;
    });
    mockFlushPendingSessions.mockImplementation(async () => {
      callOrder.push("flush");
      return { synced: 0, failed: 0, skipped: 0 };
    });

    renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(callOrder).toContain("flush");
    });

    expect(callOrder.indexOf("reset")).toBeLessThan(callOrder.indexOf("flush"));
  });

  it("calls resetStuckSyncingSessions on mount", async () => {
    renderHook(() => useSyncWorker());

    await waitFor(() => {
      expect(mockResetStuckSyncingSessions).toHaveBeenCalledWith(
        "club_aaaaaaaaaaaaaaaaaaa1",
      );
    });
  });
});
