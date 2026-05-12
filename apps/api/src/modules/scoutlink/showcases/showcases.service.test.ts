import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  publishShowcase,
  getShowcaseForAdmin,
  getShowcaseForScout,
} from "./showcases.service.js";
import { InsufficientLongitudinalDataError } from "./showcase.service.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_prisma),
  ),
}));

vi.mock("./showcase.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./showcase.service.js")>();
  return {
    ...actual,
    assertLongitudinalDataSufficient: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../communication/communication-log.service.js", () => ({
  appendCommunicationLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/sse-bus.js", () => ({
  emitShowcaseUpdated: vi.fn(),
}));

vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertAthleteExists: vi.fn().mockResolvedValue(undefined),
}));

const ATHLETE_ID = "ath_test_001";
const CLUB_ID = "club_test_001";
const ACTOR_ID = "user_test_001";

const MOCK_ATHLETE = {
  id: ATHLETE_ID,
  name: "João Silva",
  position: "Atacante",
  birthDate: new Date("2000-05-01"),
};

const MOCK_EVAL = {
  technique: 8,
  tactical: 7,
  physical: 9,
  mental: 8,
  attitude: 9,
};

const MOCK_SHOWCASE_ROW = {
  id: "showcase_001",
  clubId: CLUB_ID,
  athleteId: ATHLETE_ID,
  tier: "PREMIUM",
  snapshot: {
    athleteId: ATHLETE_ID,
    clubId: CLUB_ID,
    name: "João Silva",
    position: "Atacante",
    ageYears: 24,
    dominantFoot: null,
    rtpStatus: null,
    acwrTrend: [],
    evaluationScores: MOCK_EVAL,
    snapshotBuiltAt: new Date().toISOString(),
  },
  snapshotHash: "abc123",
  isPublished: true,
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makePrisma(overrides?: {
  athleteFindUniqueOrThrow?: ReturnType<typeof vi.fn>;
  rtpFindUnique?: ReturnType<typeof vi.fn>;
  evalFindFirst?: ReturnType<typeof vi.fn>;
  queryRaw?: ReturnType<typeof vi.fn>;
  showcaseUpsert?: ReturnType<typeof vi.fn>;
  showcaseFindUnique?: ReturnType<typeof vi.fn>;
  showcaseFindFirst?: ReturnType<typeof vi.fn>;
}) {
  return {
    athlete: {
      findUniqueOrThrow:
        overrides?.athleteFindUniqueOrThrow ??
        vi.fn().mockResolvedValue(MOCK_ATHLETE),
      findUnique: vi.fn().mockResolvedValue({ id: ATHLETE_ID }),
    },
    returnToPlay: {
      findUnique: overrides?.rtpFindUnique ?? vi.fn().mockResolvedValue(null),
    },
    technicalEvaluation: {
      findFirst:
        overrides?.evalFindFirst ?? vi.fn().mockResolvedValue(MOCK_EVAL),
    },
    $queryRaw: overrides?.queryRaw ?? vi.fn().mockResolvedValue([]),
    scoutShowcase: {
      upsert:
        overrides?.showcaseUpsert ??
        vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW),
      findUnique:
        overrides?.showcaseFindUnique ??
        vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW),
      findFirst:
        overrides?.showcaseFindFirst ??
        vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW),
    },
  } as unknown as Parameters<typeof publishShowcase>[0];
}

describe("publishShowcase — happy paths", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a ShowcaseResponse on success", async () => {
    const prisma = makePrisma();
    const result = await publishShowcase(
      prisma,
      CLUB_ID,
      ATHLETE_ID,
      ACTOR_ID,
      "PREMIUM",
    );
    expect(result.athleteId).toBe(ATHLETE_ID);
    expect(result.isPublished).toBe(true);
  });

  it("calls upsert on every publish (idempotent)", async () => {
    const upsert = vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW);
    const prisma = makePrisma({ showcaseUpsert: upsert });
    await publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "FREE");
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("calls appendCommunicationLog with SHOWCASE_PUBLISHED event", async () => {
    const { appendCommunicationLog } =
      await import("../communication/communication-log.service.js");
    const prisma = makePrisma();
    await publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "PREMIUM");
    expect(appendCommunicationLog).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ eventType: "SHOWCASE_PUBLISHED" }),
    );
  });

  it("emits SHOWCASE_UPDATED SSE event", async () => {
    const { emitShowcaseUpdated } = await import("../../../lib/sse-bus.js");
    const prisma = makePrisma();
    await publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "PREMIUM");
    expect(emitShowcaseUpdated).toHaveBeenCalledWith(
      CLUB_ID,
      expect.objectContaining({ athleteId: ATHLETE_ID }),
    );
  });
});

describe("publishShowcase — longitudinal guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("propagates InsufficientLongitudinalDataError (409) for PREMIUM with < 180 days", async () => {
    const { assertLongitudinalDataSufficient } =
      await import("./showcase.service.js");
    vi.mocked(assertLongitudinalDataSufficient).mockRejectedValueOnce(
      new InsufficientLongitudinalDataError(50),
    );
    const prisma = makePrisma();
    await expect(
      publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "PREMIUM"),
    ).rejects.toBeInstanceOf(InsufficientLongitudinalDataError);
  });

  it("does not call upsert when longitudinal guard throws", async () => {
    const { assertLongitudinalDataSufficient } =
      await import("./showcase.service.js");
    vi.mocked(assertLongitudinalDataSufficient).mockRejectedValueOnce(
      new InsufficientLongitudinalDataError(0),
    );
    const upsert = vi.fn();
    const prisma = makePrisma({ showcaseUpsert: upsert });
    await expect(
      publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "PREMIUM"),
    ).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("bypasses guard for FREE tier (0 acwr days)", async () => {
    const { assertLongitudinalDataSufficient } =
      await import("./showcase.service.js");
    vi.mocked(assertLongitudinalDataSufficient).mockResolvedValue(undefined);
    const upsert = vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW);
    const prisma = makePrisma({ showcaseUpsert: upsert });
    await publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "FREE");
    expect(upsert).toHaveBeenCalledOnce();
  });
});

describe("publishShowcase — snapshot clinical field exclusion [SEC]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("snapshot passed to upsert does not contain clinicalNotes", async () => {
    const upsert = vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW);
    const prisma = makePrisma({ showcaseUpsert: upsert });
    await publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "FREE");
    const snapshotArg = upsert.mock.calls[0]?.[0]?.create?.snapshot as Record<
      string,
      unknown
    >;
    expect(snapshotArg).not.toHaveProperty("clinicalNotes");
    expect(snapshotArg).not.toHaveProperty("diagnosis");
    expect(snapshotArg).not.toHaveProperty("treatmentDetails");
  });

  it("snapshot contains required safe fields", async () => {
    const upsert = vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW);
    const prisma = makePrisma({ showcaseUpsert: upsert });
    await publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "FREE");
    const snapshotArg = upsert.mock.calls[0]?.[0]?.create?.snapshot as Record<
      string,
      unknown
    >;
    expect(snapshotArg).toHaveProperty("athleteId");
    expect(snapshotArg).toHaveProperty("snapshotBuiltAt");
    expect(snapshotArg).toHaveProperty("acwrTrend");
  });

  it("empty acwr_aggregates produces acwrTrend: [] without throwing", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const upsert = vi.fn().mockResolvedValue(MOCK_SHOWCASE_ROW);
    const prisma = makePrisma({ queryRaw, showcaseUpsert: upsert });
    await expect(
      publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "FREE"),
    ).resolves.not.toThrow();
    const snapshotArg = upsert.mock.calls[0]?.[0]?.create?.snapshot as Record<
      string,
      unknown
    >;
    expect(snapshotArg?.["acwrTrend"]).toEqual([]);
  });
});

describe("publishShowcase — snapshotHash stability", () => {
  it("same snapshot input produces same hash on repeated calls", async () => {
    const capturedHashes: string[] = [];
    const upsert = vi.fn().mockImplementation((args: unknown) => {
      const a = args as { create: { snapshotHash: string } };
      capturedHashes.push(a.create.snapshotHash);
      return Promise.resolve(MOCK_SHOWCASE_ROW);
    });
    const fixedDate = new Date("2000-05-01");
    const athleteFindUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ ...MOCK_ATHLETE, birthDate: fixedDate });

    for (let i = 0; i < 2; i++) {
      const prisma = makePrisma({
        athleteFindUniqueOrThrow,
        showcaseUpsert: upsert,
      });
      
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
      await publishShowcase(prisma, CLUB_ID, ATHLETE_ID, ACTOR_ID, "FREE");
      vi.useRealTimers();
    }
    expect(capturedHashes[0]).toBe(capturedHashes[1]);
  });
});

describe("getShowcaseForAdmin", () => {
  it("returns showcase when found", async () => {
    const prisma = makePrisma();
    const result = await getShowcaseForAdmin(prisma, CLUB_ID, ATHLETE_ID);
    expect(result).not.toBeNull();
    expect(result?.athleteId).toBe(ATHLETE_ID);
  });

  it("returns null when showcase does not exist (wrong tenant)", async () => {
    const prisma = makePrisma({
      showcaseFindUnique: vi.fn().mockResolvedValue(null),
    });
    const result = await getShowcaseForAdmin(prisma, "other_club", ATHLETE_ID);
    expect(result).toBeNull();
  });
});

describe("getShowcaseForScout", () => {
  it("returns published showcase", async () => {
    const prisma = makePrisma();
    const result = await getShowcaseForScout(prisma, ATHLETE_ID);
    expect(result?.isPublished).toBe(true);
  });

  it("returns null when no published showcase exists", async () => {
    const prisma = makePrisma({
      showcaseFindFirst: vi.fn().mockResolvedValue(null),
    });
    const result = await getShowcaseForScout(prisma, ATHLETE_ID);
    expect(result).toBeNull();
  });
});
