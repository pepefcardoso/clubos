import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertLongitudinalDataSufficient,
  InsufficientLongitudinalDataError,
} from "./showcase.service.js";
import type { PrismaClient } from "../../../../generated/prisma/index.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      prisma: PrismaClient,
      _clubId: string,
      fn: (tx: PrismaClient) => Promise<unknown>,
    ) => fn(prisma),
  ),
}));

function makePrisma(spanDays: number | null): PrismaClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ span_days: spanDays }]),
  } as unknown as PrismaClient;
}

function makePrismaNoRows(): PrismaClient {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ span_days: null }]),
  } as unknown as PrismaClient;
}

const CLUB_ID = "clu_test_club";
const ATHLETE_ID = "clu_test_athlete";

describe("assertLongitudinalDataSufficient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PREMIUM tier", () => {
    it("throws InsufficientLongitudinalDataError (409) when span is 179 days", async () => {
      const prisma = makePrisma(179);
      await expect(
        assertLongitudinalDataSufficient(
          prisma,
          CLUB_ID,
          ATHLETE_ID,
          "PREMIUM",
        ),
      ).rejects.toThrow(InsufficientLongitudinalDataError);
    });

    it("error message includes actual span and minimum threshold", async () => {
      const prisma = makePrisma(179);
      await expect(
        assertLongitudinalDataSufficient(
          prisma,
          CLUB_ID,
          ATHLETE_ID,
          "PREMIUM",
        ),
      ).rejects.toThrow("179 dias registrados");
    });

    it("resolves without throwing when span is exactly 180 days", async () => {
      const prisma = makePrisma(180);
      await expect(
        assertLongitudinalDataSufficient(
          prisma,
          CLUB_ID,
          ATHLETE_ID,
          "PREMIUM",
        ),
      ).resolves.toBeUndefined();
    });

    it("resolves without throwing when span exceeds 180 days", async () => {
      const prisma = makePrisma(365);
      await expect(
        assertLongitudinalDataSufficient(
          prisma,
          CLUB_ID,
          ATHLETE_ID,
          "PREMIUM",
        ),
      ).resolves.toBeUndefined();
    });

    it("throws when workload_metrics has no rows (span_days = null → 0)", async () => {
      const prisma = makePrismaNoRows();
      await expect(
        assertLongitudinalDataSufficient(
          prisma,
          CLUB_ID,
          ATHLETE_ID,
          "PREMIUM",
        ),
      ).rejects.toThrow(InsufficientLongitudinalDataError);
    });

    it("thrown error carries statusCode 409 via ConflictError base", async () => {
      const prisma = makePrisma(0);
      let caught: unknown;
      try {
        await assertLongitudinalDataSufficient(
          prisma,
          CLUB_ID,
          ATHLETE_ID,
          "PREMIUM",
        );
      } catch (err) {
        caught = err;
      }
      expect((caught as InsufficientLongitudinalDataError).statusCode).toBe(
        409,
      );
    });
  });

  describe("FREE tier", () => {
    it("resolves without querying when span is 0 days", async () => {
      const prisma = makePrisma(0);
      await expect(
        assertLongitudinalDataSufficient(prisma, CLUB_ID, ATHLETE_ID, "FREE"),
      ).resolves.toBeUndefined();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("resolves without querying when athlete has no workload rows", async () => {
      const prisma = makePrismaNoRows();
      await expect(
        assertLongitudinalDataSufficient(prisma, CLUB_ID, ATHLETE_ID, "FREE"),
      ).resolves.toBeUndefined();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("resolves without querying when span is 50 days", async () => {
      const prisma = makePrisma(50);
      await expect(
        assertLongitudinalDataSufficient(prisma, CLUB_ID, ATHLETE_ID, "FREE"),
      ).resolves.toBeUndefined();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
