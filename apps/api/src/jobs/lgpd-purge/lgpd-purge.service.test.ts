import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  computePurgeCutoff,
  purgeExpiredConsentRecords,
} from "./lgpd-purge.service.js";

function makePrisma(): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn(),
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";

describe("computePurgeCutoff()", () => {
  it("subtracts retentionMonths from the reference date", () => {
    const now = new Date("2025-03-15T12:00:00.000Z");
    const cutoff = computePurgeCutoff(24, now);
    expect(cutoff.getUTCFullYear()).toBe(2023);
    expect(cutoff.getUTCMonth()).toBe(2);
    expect(cutoff.getUTCDate()).toBe(15);
  });

  it("returns midnight UTC (no time component)", () => {
    const now = new Date("2025-06-10T18:45:30.123Z");
    const cutoff = computePurgeCutoff(24, now);
    expect(cutoff.getUTCHours()).toBe(0);
    expect(cutoff.getUTCMinutes()).toBe(0);
    expect(cutoff.getUTCSeconds()).toBe(0);
    expect(cutoff.getUTCMilliseconds()).toBe(0);
  });

  it("handles month-boundary correctly (March 1 - 24 months = March 1 two years ago)", () => {
    const now = new Date("2025-03-01T00:00:00.000Z");
    const cutoff = computePurgeCutoff(24, now);
    expect(cutoff.toISOString()).toBe("2023-03-01T00:00:00.000Z");
  });

  it("handles year-boundary rollover (Jan 2025 - 24 months = Jan 2023)", () => {
    const now = new Date("2025-01-15T00:00:00.000Z");
    const cutoff = computePurgeCutoff(24, now);
    expect(cutoff.getUTCFullYear()).toBe(2023);
    expect(cutoff.getUTCMonth()).toBe(0);
    expect(cutoff.getUTCDate()).toBe(15);
  });

  it("handles single-month retention", () => {
    const now = new Date("2025-03-20T00:00:00.000Z");
    const cutoff = computePurgeCutoff(1, now);
    expect(cutoff.getUTCFullYear()).toBe(2025);
    expect(cutoff.getUTCMonth()).toBe(1);
    expect(cutoff.getUTCDate()).toBe(20);
  });

  it("uses current date when no reference is provided (smoke test)", () => {
    const before = new Date();
    const cutoff = computePurgeCutoff(24);
    const after = new Date();

    const approxMs = 24 * 30 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(
      before.getTime() - approxMs - 86_400_000,
    );
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      after.getTime() - approxMs + 86_400_000,
    );
  });

  it("different retentionMonths produce different cutoffs", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const cutoff12 = computePurgeCutoff(12, now);
    const cutoff24 = computePurgeCutoff(24, now);
    expect(cutoff12.getTime()).toBeGreaterThan(cutoff24.getTime());
  });
});

describe("purgeExpiredConsentRecords()", () => {
  let prisma: ReturnType<typeof makePrisma>;
  const purgeBefore = new Date("2023-03-01T00:00:00.000Z");

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("returns clubId in the result", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const result = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );
    expect(result.clubId).toBe(CLUB_ID);
  });

  it("returns the purgedBefore date in the result", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const result = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );
    expect(result.purgedBefore).toEqual(purgeBefore);
  });

  it("returns a non-negative durationMs", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const result = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns deleted: 0 when no rows match the cutoff", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const result = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );
    expect(result.deleted).toBe(0);
  });

  it("returns correct deleted count from RETURNING rows", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "audit-001" },
      { id: "audit-002" },
      { id: "audit-003" },
    ]);
    const result = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );
    expect(result.deleted).toBe(3);
  });

  it("calls $queryRaw inside a transaction (via withTenantSchema)", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    await purgeExpiredConsentRecords(prisma, CLUB_ID, purgeBefore);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("calls $executeRawUnsafe to set search_path for the tenant schema", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    await purgeExpiredConsentRecords(prisma, CLUB_ID, purgeBefore);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`clube_${CLUB_ID}`),
    );
  });

  it("re-throws database errors from $queryRaw", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error("DB connection lost"),
    );
    await expect(
      purgeExpiredConsentRecords(prisma, CLUB_ID, purgeBefore),
    ).rejects.toThrow("DB connection lost");
  });

  it("returns deleted: 1 for a single matching row", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: "audit-001" }]);
    const result = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );
    expect(result.deleted).toBe(1);
  });

  it("is idempotent — second call with no remaining rows returns deleted: 0", async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ id: "audit-001" }])
      .mockResolvedValueOnce([]);

    const first = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );
    const second = await purgeExpiredConsentRecords(
      prisma,
      CLUB_ID,
      purgeBefore,
    );

    expect(first.deleted).toBe(1);
    expect(second.deleted).toBe(0);
  });
});
