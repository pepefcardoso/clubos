import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertLongitudinalDataSufficient,
  InsufficientLongitudinalDataError,
  projectShowcase,
} from "./showcase.service.js";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { ShowcaseSnapshot } from "@clubos/shared-types";

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

const BASE_SNAPSHOT: ShowcaseSnapshot = {
  athleteId: "ath_001",
  clubId: "club_001",
  name: "João Silva",
  position: "Atacante",
  ageYears: 22,
  dominantFoot: "right",
  state: "SP",
  rtpStatus: "LIBERADO",
  acwrTrend: [
    {
      date: "2024-01-01",
      acwrRatio: 1.1,
      riskZone: "OPTIMAL",
      acuteLoadAu: 300,
      chronicLoadAu: 270,
    },
  ],
  evaluationScores: {
    technique: 8,
    tactical: 7,
    physical: 9,
    mental: 8,
    attitude: 9,
  },
  snapshotBuiltAt: "2024-01-01T00:00:00.000Z",
};

describe("projectShowcase — projection matrix", () => {
  it("PREMIUM scout + PREMIUM showcase → full depth, upgrade_required: false", () => {
    const result = projectShowcase(BASE_SNAPSHOT, true, "PREMIUM", 3);
    expect(result).toMatchInlineSnapshot(`
      {
        "acwrTrend": [
          {
            "acuteLoadAu": 300,
            "acwrRatio": 1.1,
            "chronicLoadAu": 270,
            "date": "2024-01-01",
            "riskZone": "OPTIMAL",
          },
        ],
        "ageYears": 22,
        "evaluationScores": {
          "attitude": 9,
          "mental": 8,
          "physical": 9,
          "tactical": 7,
          "technique": 8,
        },
        "nameInitials": "JS",
        "position": "Atacante",
        "rtpStatus": "LIBERADO",
        "state": "SP",
        "upgrade_required": false,
        "videoCount": 3,
      }
    `);
  });

  it("FREE scout + PREMIUM showcase → identity null, analytics null, upgrade_required: true", () => {
    const result = projectShowcase(BASE_SNAPSHOT, false, "PREMIUM", 3);
    expect(result).toMatchInlineSnapshot(`
      {
        "acwrTrend": null,
        "ageYears": null,
        "evaluationScores": null,
        "nameInitials": "JS",
        "position": null,
        "rtpStatus": null,
        "state": null,
        "upgrade_required": true,
        "videoCount": null,
      }
    `);
  });

  it("PREMIUM scout + FREE showcase → identity visible, analytics null, upgrade_required: true", () => {
    const result = projectShowcase(BASE_SNAPSHOT, true, "FREE", 3);
    expect(result.position).toBe("Atacante");
    expect(result.ageYears).toBe(22);
    expect(result.state).toBe("SP");
    expect(result.rtpStatus).toBe("LIBERADO");
    expect(result.acwrTrend).toBeNull();
    expect(result.evaluationScores).toBeNull();
    expect(result.videoCount).toBeNull();
    expect(result.upgrade_required).toBe(true);
  });

  it("FREE scout + FREE showcase → only nameInitials, all else null, upgrade_required: true", () => {
    const result = projectShowcase(BASE_SNAPSHOT, false, "FREE", 0);
    expect(result.nameInitials).toBe("JS");
    expect(result.position).toBeNull();
    expect(result.ageYears).toBeNull();
    expect(result.state).toBeNull();
    expect(result.rtpStatus).toBeNull();
    expect(result.acwrTrend).toBeNull();
    expect(result.evaluationScores).toBeNull();
    expect(result.videoCount).toBeNull();
    expect(result.upgrade_required).toBe(true);
  });
});

describe("projectShowcase — nameInitials", () => {
  it("multi-word name → initials of each word", () => {
    const snap = { ...BASE_SNAPSHOT, name: "Marcos Vinícius" };
    expect(projectShowcase(snap, true, "PREMIUM", 0).nameInitials).toBe("MV");
  });

  it("single-word name → single initial", () => {
    const snap = { ...BASE_SNAPSHOT, name: "Pelé" };
    expect(projectShowcase(snap, true, "PREMIUM", 0).nameInitials).toBe("P");
  });

  it("nameInitials always present regardless of tier", () => {
    expect(projectShowcase(BASE_SNAPSHOT, false, "FREE", 0).nameInitials).toBe(
      "JS",
    );
  });
});

describe("projectShowcase — edge cases on full-depth path", () => {
  it("acwrTrend: [] → returned as [], not null", () => {
    const snap = { ...BASE_SNAPSHOT, acwrTrend: [] };
    const result = projectShowcase(snap, true, "PREMIUM", 0);
    expect(result.acwrTrend).toEqual([]);
    expect(result.acwrTrend).not.toBeNull();
  });

  it("evaluationScores: null → returned as null (no crash)", () => {
    const snap = { ...BASE_SNAPSHOT, evaluationScores: null };
    const result = projectShowcase(snap, true, "PREMIUM", 0);
    expect(result.evaluationScores).toBeNull();
    expect(result.upgrade_required).toBe(false);
  });

  it("videoCount: 0 on full-depth path → 0, upgrade_required: false", () => {
    const result = projectShowcase(BASE_SNAPSHOT, true, "PREMIUM", 0);
    expect(result.videoCount).toBe(0);
    expect(result.upgrade_required).toBe(false);
  });

  it("snapshot.state: null on PREMIUM scout path → null (not undefined)", () => {
    const snap = { ...BASE_SNAPSHOT, state: null };
    const result = projectShowcase(snap, true, "PREMIUM", 1);
    expect(result.state).toBeNull();
  });
});
