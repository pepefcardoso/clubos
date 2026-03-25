import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { refreshAcwrAggregates } from "./acwr-refresh.service.js";

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

describe("refreshAcwrAggregates()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("returns the clubId in the result", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 0n }]);
    const result = await refreshAcwrAggregates(prisma, CLUB_ID);
    expect(result.clubId).toBe(CLUB_ID);
  });

  it("returns a refreshedAt Date", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 0n }]);
    const result = await refreshAcwrAggregates(prisma, CLUB_ID);
    expect(result.refreshedAt).toBeInstanceOf(Date);
  });

  it("returns a non-negative durationMs", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 0n }]);
    const result = await refreshAcwrAggregates(prisma, CLUB_ID);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  describe("when the view is empty (row_count = 0) — first run", () => {
    beforeEach(() => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 0n }]);
    });

    it("calls $executeRawUnsafe with a non-concurrent REFRESH", async () => {
      await refreshAcwrAggregates(prisma, CLUB_ID);
      const call = vi.mocked(prisma.$executeRawUnsafe).mock
        .calls[0]?.[0] as string;
      expect(call).toContain("REFRESH MATERIALIZED VIEW");
      expect(call).not.toContain("CONCURRENTLY");
    });

    it("returns concurrent: false", async () => {
      const result = await refreshAcwrAggregates(prisma, CLUB_ID);
      expect(result.concurrent).toBe(false);
    });

    it("uses the schema-qualified view name", async () => {
      await refreshAcwrAggregates(prisma, CLUB_ID);
      const call = vi.mocked(prisma.$executeRawUnsafe).mock
        .calls[0]?.[0] as string;
      expect(call).toContain(`clube_${CLUB_ID}`);
      expect(call).toContain("acwr_aggregates");
    });
  });

  describe("when the view has data (row_count > 0) — subsequent runs", () => {
    beforeEach(() => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 42n }]);
    });

    it("calls $executeRawUnsafe with REFRESH MATERIALIZED VIEW CONCURRENTLY", async () => {
      await refreshAcwrAggregates(prisma, CLUB_ID);
      const call = vi.mocked(prisma.$executeRawUnsafe).mock
        .calls[0]?.[0] as string;
      expect(call).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY");
    });

    it("returns concurrent: true", async () => {
      const result = await refreshAcwrAggregates(prisma, CLUB_ID);
      expect(result.concurrent).toBe(true);
    });

    it("uses the schema-qualified view name", async () => {
      await refreshAcwrAggregates(prisma, CLUB_ID);
      const call = vi.mocked(prisma.$executeRawUnsafe).mock
        .calls[0]?.[0] as string;
      expect(call).toContain(`clube_${CLUB_ID}`);
      expect(call).toContain("acwr_aggregates");
    });
  });

  it("uses withTenantSchema ($transaction) for the probe", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 0n }]);
    await refreshAcwrAggregates(prisma, CLUB_ID);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("does NOT wrap the REFRESH in a transaction ($executeRawUnsafe called on root prisma)", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 5n }]);
    await refreshAcwrAggregates(prisma, CLUB_ID);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledOnce();
  });

  it("handles missing probe row gracefully (treats as empty view)", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    const result = await refreshAcwrAggregates(prisma, CLUB_ID);
    expect(result.concurrent).toBe(false);
    const call = vi.mocked(prisma.$executeRawUnsafe).mock
      .calls[0]?.[0] as string;
    expect(call).not.toContain("CONCURRENTLY");
  });

  it("re-throws database errors from the probe", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error("DB connection lost"),
    );
    await expect(refreshAcwrAggregates(prisma, CLUB_ID)).rejects.toThrow(
      "DB connection lost",
    );
  });

  it("re-throws database errors from the REFRESH statement", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: 0n }]);
    vi.mocked(prisma.$executeRawUnsafe).mockRejectedValue(
      new Error("permission denied for materialized view"),
    );
    await expect(refreshAcwrAggregates(prisma, CLUB_ID)).rejects.toThrow(
      "permission denied for materialized view",
    );
  });

  it("uses exactly one $executeRawUnsafe call regardless of concurrent/non-concurrent path", async () => {
    for (const rowCount of [0n, 1n, 100n]) {
      prisma = makePrisma();
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ row_count: rowCount }]);
      await refreshAcwrAggregates(prisma, CLUB_ID);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledOnce();
    }
  });
});
