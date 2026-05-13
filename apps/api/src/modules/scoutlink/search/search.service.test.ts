import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchAthletes } from "./search.service.js";

const SCOUT_ID = "scout_001";

const ACTIVE_PREMIUM_SCOUT = {
  subscriptionStatus: "ACTIVE",
  subscriptionExpiresAt: new Date(Date.now() + 86_400_000),
};

const INACTIVE_SCOUT = {
  subscriptionStatus: "INACTIVE",
  subscriptionExpiresAt: null,
};

const LAPSED_SCOUT = {
  subscriptionStatus: "ACTIVE",
  subscriptionExpiresAt: new Date(Date.now() - 1000),
};

const PREMIUM_SHOWCASE_ROW = {
  id: "sc_001",
  clubId: "club_001",
  athleteId: "ath_001",
  tier: "PREMIUM",
  snapshot: {
    athleteId: "ath_001",
    clubId: "club_001",
    name: "João Silva",
    position: "Atacante",
    ageYears: 22,
    dominantFoot: null,
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
  },
  video_count: 3,
};

const FREE_SHOWCASE_ROW = {
  ...PREMIUM_SHOWCASE_ROW,
  id: "sc_002",
  tier: "FREE",
};

function makePrisma(overrides?: {
  scout?: object | null;
  rows?: object[];
  count?: bigint;
}) {
  const rows = overrides?.rows ?? [PREMIUM_SHOWCASE_ROW];
  const count = overrides?.count ?? BigInt(rows.length);

  return {
    scoutProfile: {
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides?.scout ?? ACTIVE_PREMIUM_SCOUT),
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([{ count }]),
  } as unknown as Parameters<typeof searchAthletes>[0];
}

beforeEach(() => vi.clearAllMocks());

describe("searchAthletes — freemium projection", () => {
  it("PREMIUM scout + PREMIUM showcase → full projection, upgrade_required: false", async () => {
    const prisma = makePrisma();
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    const item = result.data[0]!;
    expect(item.upgrade_required).toBe(false);
    expect(item.acwrTrend).not.toBeNull();
    expect(item.evaluationScores).not.toBeNull();
    expect(item.videoCount).toBe(3);
  });

  it("FREE scout (INACTIVE) + PREMIUM showcase → null on PREMIUM fields, upgrade_required: true", async () => {
    const prisma = makePrisma({ scout: INACTIVE_SCOUT });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    const item = result.data[0]!;
    expect(item.upgrade_required).toBe(true);
    expect(item.acwrTrend).toBeNull();
    expect(item.evaluationScores).toBeNull();
    expect(item.videoCount).toBeNull();
  });

  it("PREMIUM scout + FREE showcase → null on PREMIUM fields, upgrade_required: true", async () => {
    const prisma = makePrisma({ rows: [FREE_SHOWCASE_ROW] });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    const item = result.data[0]!;
    expect(item.upgrade_required).toBe(true);
    expect(item.acwrTrend).toBeNull();
  });

  it("FREE scout + FREE showcase → upgrade_required: true", async () => {
    const prisma = makePrisma({
      scout: INACTIVE_SCOUT,
      rows: [FREE_SHOWCASE_ROW],
    });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data[0]!.upgrade_required).toBe(true);
  });

  it("lapsed subscription (ACTIVE but expiresAt < now) → treated as FREE", async () => {
    const prisma = makePrisma({ scout: LAPSED_SCOUT });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data[0]!.upgrade_required).toBe(true);
    expect(result.data[0]!.acwrTrend).toBeNull();
  });

  it("nameInitials is always present regardless of tier", async () => {
    const prisma = makePrisma({ scout: INACTIVE_SCOUT });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data[0]!.nameInitials).toBe("JS");
  });
});

describe("searchAthletes — pagination", () => {
  it("returns page and limit from params", async () => {
    const prisma = makePrisma();
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 2,
      limit: 10,
    });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it("returns total from count query", async () => {
    const prisma = makePrisma({ count: BigInt(42) });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(42);
  });

  it("returns empty data array when no rows", async () => {
    const prisma = makePrisma({ rows: [], count: BigInt(0) });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("searchAthletes — null scout", () => {
  it("treats missing scout profile as FREE (no rows in public schema)", async () => {
    const prisma = makePrisma({ scout: null });
    const result = await searchAthletes(prisma, SCOUT_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data[0]!.upgrade_required).toBe(true);
  });
});

describe("searchAthletes — query forwarding", () => {
  it("calls $queryRaw twice (data + count)", async () => {
    const prisma = makePrisma();
    await searchAthletes(prisma, SCOUT_ID, { page: 1, limit: 20 });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
