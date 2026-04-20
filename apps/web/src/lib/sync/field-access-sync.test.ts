import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FieldAccessQueueEntry } from "@/lib/db/types";

const {
  mockGetPendingScans,
  mockMarkScanSyncing,
  mockMarkScanSynced,
  mockMarkScanError,
  mockValidateAccess,
  mockIsOnline,
} = vi.hoisted(() => ({
  mockGetPendingScans: vi.fn(),
  mockMarkScanSyncing: vi.fn().mockResolvedValue(undefined),
  mockMarkScanSynced: vi.fn().mockResolvedValue(undefined),
  mockMarkScanError: vi.fn().mockResolvedValue(undefined),
  mockValidateAccess: vi.fn(),
  mockIsOnline: { value: true },
}));

vi.mock("@/lib/db/field-access.db", () => ({
  getPendingScans: mockGetPendingScans,
  markScanSyncing: mockMarkScanSyncing,
  markScanSynced: mockMarkScanSynced,
  markScanError: mockMarkScanError,
}));

vi.mock("@/lib/api/field-access", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/api/field-access")>();
  return {
    FieldAccessApiError: original.FieldAccessApiError,
    validateAccess: mockValidateAccess,
  };
});

import { flushPendingScans } from "./field-access-sync";
import { FieldAccessApiError } from "@/lib/api/field-access";

const CLUB_ID = "club_aaaaaaaaaaaaaaaaaaa1";
const FAKE_TOKEN = "test-access-token";
const getAccessToken = vi.fn().mockResolvedValue(FAKE_TOKEN);

const makeScan = (
  overrides: Partial<FieldAccessQueueEntry> = {},
): FieldAccessQueueEntry => ({
  localId: "aabbccdd-eeff-0011-2233-445566778899",
  clubId: CLUB_ID,
  eventId: "event_001",
  token: "header.payload.sig",
  scannedAt: new Date().toISOString(),
  syncStatus: "pending",
  syncError: null,
  localValid: true,
  serverId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

const SERVER_RESPONSE = {
  valid: true,
  accessLogId: "log_server_001",
  scannedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsOnline.value = true;
  getAccessToken.mockResolvedValue(FAKE_TOKEN);
  mockGetPendingScans.mockResolvedValue([]);
  mockValidateAccess.mockResolvedValue(SERVER_RESPONSE);
  mockMarkScanSyncing.mockResolvedValue(undefined);
  mockMarkScanSynced.mockResolvedValue(undefined);
  mockMarkScanError.mockResolvedValue(undefined);

  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => mockIsOnline.value,
  });
});

describe("flushPendingScans", () => {
  it("returns { synced: 0, failed: 0 } when there are no pending scans", async () => {
    mockGetPendingScans.mockResolvedValue([]);
    const result = await flushPendingScans(CLUB_ID, getAccessToken);
    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(mockValidateAccess).not.toHaveBeenCalled();
  });

  it("returns { synced: 0, failed: 0 } when getAccessToken returns null", async () => {
    mockGetPendingScans.mockResolvedValue([makeScan(), makeScan({ localId: "bb".repeat(4) + "-0000-0000-0000-000000000000" })]);
    getAccessToken.mockResolvedValue(null);
    const result = await flushPendingScans(CLUB_ID, getAccessToken);
    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(mockValidateAccess).not.toHaveBeenCalled();
  });

  it("calls validateAccess with the correct payload including idempotencyKey = localId", async () => {
    const scan = makeScan();
    mockGetPendingScans.mockResolvedValue([scan]);

    await flushPendingScans(CLUB_ID, getAccessToken);

    expect(mockValidateAccess).toHaveBeenCalledWith(
      scan.eventId,
      expect.objectContaining({
        token: scan.token,
        idempotencyKey: scan.localId,
        scannedAt: scan.scannedAt,
      }),
      FAKE_TOKEN,
    );
  });

  it("marks scan as synced with the server accessLogId on success", async () => {
    const scan = makeScan();
    mockGetPendingScans.mockResolvedValue([scan]);

    await flushPendingScans(CLUB_ID, getAccessToken);

    expect(mockMarkScanSynced).toHaveBeenCalledWith(scan.localId, SERVER_RESPONSE.accessLogId);
  });

  it("returns { synced: 2, failed: 0 } for two successful scans", async () => {
    const s1 = makeScan({ localId: "scan-aaaa-0000-0000-0000-000000000001" });
    const s2 = makeScan({ localId: "scan-bbbb-0000-0000-0000-000000000002" });
    mockGetPendingScans.mockResolvedValue([s1, s2]);

    const result = await flushPendingScans(CLUB_ID, getAccessToken);
    expect(result).toEqual({ synced: 2, failed: 0 });
  });

  it("calls markScanSyncing before validateAccess", async () => {
    const scan = makeScan();
    mockGetPendingScans.mockResolvedValue([scan]);

    const callOrder: string[] = [];
    mockMarkScanSyncing.mockImplementation(async () => { callOrder.push("syncing"); });
    mockValidateAccess.mockImplementation(async () => { callOrder.push("validate"); return SERVER_RESPONSE; });

    await flushPendingScans(CLUB_ID, getAccessToken);

    expect(callOrder.indexOf("syncing")).toBeLessThan(callOrder.indexOf("validate"));
  });

  it("marks scan as error on 4xx API response", async () => {
    const scan = makeScan();
    mockGetPendingScans.mockResolvedValue([scan]);
    mockValidateAccess.mockRejectedValue(new FieldAccessApiError("Bad Request", 400));

    const result = await flushPendingScans(CLUB_ID, getAccessToken);

    expect(result).toEqual({ synced: 0, failed: 1 });
    expect(mockMarkScanError).toHaveBeenCalledWith(
      scan.localId,
      expect.stringContaining("400"),
    );
    expect(mockMarkScanSynced).not.toHaveBeenCalled();
  });

  it("marks scan as error on 401 (token expired mid-flush)", async () => {
    const scan = makeScan();
    mockGetPendingScans.mockResolvedValue([scan]);
    mockValidateAccess.mockRejectedValue(new FieldAccessApiError("Unauthorized", 401));

    await flushPendingScans(CLUB_ID, getAccessToken);

    expect(mockMarkScanError).toHaveBeenCalledWith(
      scan.localId,
      expect.stringContaining("401"),
    );
  });

  it("marks scan as error on network failure (fetch throws)", async () => {
    const scan = makeScan();
    mockGetPendingScans.mockResolvedValue([scan]);
    mockValidateAccess.mockRejectedValue(new TypeError("Failed to fetch"));

    await flushPendingScans(CLUB_ID, getAccessToken);

    expect(mockMarkScanError).toHaveBeenCalledWith(scan.localId, "Failed to fetch");
  });

  it("mixed: first scan succeeds, second fails → { synced: 1, failed: 1 }", async () => {
    const s1 = makeScan({ localId: "scan-good-0000-0000-0000-000000000001" });
    const s2 = makeScan({ localId: "scan-fail-0000-0000-0000-000000000002" });
    mockGetPendingScans.mockResolvedValue([s1, s2]);
    mockValidateAccess
      .mockResolvedValueOnce(SERVER_RESPONSE)
      .mockRejectedValueOnce(new FieldAccessApiError("Not Found", 404));

    const result = await flushPendingScans(CLUB_ID, getAccessToken);
    expect(result).toEqual({ synced: 1, failed: 1 });
  });

  it("stops mid-flush when navigator.onLine becomes false", async () => {
    const scans = [
      makeScan({ localId: "scan-0001-0000-0000-0000-000000000001" }),
      makeScan({ localId: "scan-0002-0000-0000-0000-000000000002" }),
      makeScan({ localId: "scan-0003-0000-0000-0000-000000000003" }),
    ];
    mockGetPendingScans.mockResolvedValue(scans);

    let callCount = 0;
    mockMarkScanSyncing.mockImplementation(async () => {
      callCount++;
      if (callCount >= 2) {
        Object.defineProperty(navigator, "onLine", {
          configurable: true,
          get: () => false,
        });
      }
    });

    await flushPendingScans(CLUB_ID, getAccessToken);

    expect(mockMarkScanSyncing).toHaveBeenCalledTimes(1);
  });

  it("processes scans in the order returned by getPendingScans (oldest-first)", async () => {
    const s1 = makeScan({ localId: "scan-aaa1-0000-0000-0000-000000000001" });
    const s2 = makeScan({ localId: "scan-bbb2-0000-0000-0000-000000000002" });
    mockGetPendingScans.mockResolvedValue([s1, s2]);

    const syncingOrder: string[] = [];
    mockMarkScanSyncing.mockImplementation(async (id: string) => {
      syncingOrder.push(id);
    });

    await flushPendingScans(CLUB_ID, getAccessToken);

    expect(syncingOrder[0]).toBe(s1.localId);
    expect(syncingOrder[1]).toBe(s2.localId);
  });

  it("server valid=false does NOT count as a failure — validateAccess succeeded", async () => {
    const scan = makeScan();
    mockGetPendingScans.mockResolvedValue([scan]);
    mockValidateAccess.mockResolvedValue({
      ...SERVER_RESPONSE,
      valid: false,
      reason: "QR Code expirado.",
    });

    const result = await flushPendingScans(CLUB_ID, getAccessToken);
    expect(result).toEqual({ synced: 1, failed: 0 });
    expect(mockMarkScanSynced).toHaveBeenCalled();
    expect(mockMarkScanError).not.toHaveBeenCalled();
  });
});