import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  recordWorkloadMetric,
  getAthleteAcwr,
  AthleteNotFoundError,
} from "./workload.service.js";

/** Builds a minimal Prisma mock scoped to the calls made inside withTenantSchema. */
function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
    athlete: {
      findUnique: vi.fn(),
    },
    workloadMetric: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";
const ACTOR_ID = "user_actor_001";
const ATHLETE_ID = "athlete_001";

const VALID_INPUT = {
  athleteId: ATHLETE_ID,
  date: "2024-06-01",
  rpe: 7,
  durationMinutes: 60,
  sessionType: "TRAINING" as const,
};

describe("AthleteNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new AthleteNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new AthleteNotFoundError().name).toBe("AthleteNotFoundError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new AthleteNotFoundError().message).toMatch(/Atleta/);
  });

  it("can be caught via instanceof", () => {
    expect(() => {
      throw new AthleteNotFoundError();
    }).toThrowError(AthleteNotFoundError);
  });
});

describe("recordWorkloadMetric()", () => {
  const METRIC_ROW = {
    id: "metric_001",
    athleteId: ATHLETE_ID,
    date: new Date("2024-06-01"),
    rpe: 7,
    durationMinutes: 60,
    sessionType: "TRAINING",
    notes: null,
    createdAt: new Date("2024-06-01T10:00:00Z"),
    updatedAt: new Date("2024-06-01T10:00:00Z"),
    trainingSessionId: null,
  };

  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.workloadMetric.create).mockResolvedValue(
      METRIC_ROW as never,
    );
  });

  it("returns trainingLoadAu = rpe × durationMinutes", async () => {
    const result = await recordWorkloadMetric(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      VALID_INPUT,
    );
    expect(result.trainingLoadAu).toBe(7 * 60);
  });

  it("returns the correct metric shape", async () => {
    const result = await recordWorkloadMetric(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      VALID_INPUT,
    );
    expect(result).toMatchObject({
      id: "metric_001",
      athleteId: ATHLETE_ID,
      rpe: 7,
      durationMinutes: 60,
      sessionType: "TRAINING",
      notes: null,
      trainingLoadAu: 420,
    });
  });

  it("throws AthleteNotFoundError when athlete does not exist", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(null);

    await expect(
      recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, VALID_INPUT),
    ).rejects.toThrowError(AthleteNotFoundError);
  });

  it("writes an audit log entry with athleteId, rpe, and trainingLoadAu", async () => {
    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, VALID_INPUT);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: ACTOR_ID,
          entityType: "WorkloadMetric",
          metadata: expect.objectContaining({
            athleteId: ATHLETE_ID,
            rpe: 7,
            durationMinutes: 60,
            trainingLoadAu: 420,
          }),
        }),
      }),
    );
  });

  it("stores sessionType TRAINING by default when not provided", async () => {
    const inputWithoutType = {
      athleteId: ATHLETE_ID,
      date: "2024-06-01",
      rpe: 5,
      durationMinutes: 45,
      sessionType: "TRAINING" as const,
    };

    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, inputWithoutType);

    expect(prisma.workloadMetric.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sessionType: "TRAINING" }),
      }),
    );
  });

  it("stores notes as null when not provided", async () => {
    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, VALID_INPUT);

    expect(prisma.workloadMetric.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: null }),
      }),
    );
  });

  it("stores provided notes correctly", async () => {
    const withNotes = { ...VALID_INPUT, notes: "Pre-season warmup" };
    const metricWithNotes = { ...METRIC_ROW, notes: "Pre-season warmup" };
    vi.mocked(prisma.workloadMetric.create).mockResolvedValue(
      metricWithNotes as never,
    );

    const result = await recordWorkloadMetric(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      withNotes,
    );
    expect(result.notes).toBe("Pre-season warmup");
  });

  it("calls withTenantSchema (uses $transaction)", async () => {
    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, VALID_INPUT);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("sets the correct date on the metric", async () => {
    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, VALID_INPUT);

    expect(prisma.workloadMetric.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          date: new Date("2024-06-01"),
        }),
      }),
    );
  });
});

describe("getAthleteAcwr()", () => {
  const RAW_ROW = {
    athleteId: ATHLETE_ID,
    date: new Date("2024-06-01"),
    daily_au: 420,
    acute_load_au: 2100,
    chronic_load_au: "1800.00",
    acute_window_days: 5,
    chronic_window_days: 20,
    acwr_ratio: "1.17",
    risk_zone: "optimal",
  };

  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([RAW_ROW]);
  });

  it("throws AthleteNotFoundError when athlete does not exist", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(null);

    await expect(
      getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID),
    ).rejects.toThrowError(AthleteNotFoundError);
  });

  it("returns empty history and null latest when view has no rows for athlete", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);

    expect(result.history).toHaveLength(0);
    expect(result.latest).toBeNull();
  });

  it("returns the athleteId in the response", async () => {
    const result = await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);
    expect(result.athleteId).toBe(ATHLETE_ID);
  });

  it("returns latest as the last entry in the history array", async () => {
    const row2 = {
      ...RAW_ROW,
      date: new Date("2024-06-02"),
      acwr_ratio: "1.20",
    };
    vi.mocked(prisma.$queryRaw).mockResolvedValue([RAW_ROW, row2]);

    const result = await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);

    expect(result.history).toHaveLength(2);
    expect(result.latest?.date).toEqual(new Date("2024-06-02"));
    expect(result.latest?.acwrRatio).toBe(1.2);
  });

  it("maps NUMERIC DB strings to JS numbers (acwrRatio, chronicLoadAu)", async () => {
    const result = await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);

    const entry = result.history[0]!;
    expect(typeof entry.acwrRatio).toBe("number");
    expect(typeof entry.chronicLoadAu).toBe("number");
    expect(entry.acwrRatio).toBe(1.17);
    expect(entry.chronicLoadAu).toBe(1800.0);
  });

  it("returns acwrRatio as null when the raw value is null (no chronic data)", async () => {
    const nullRatioRow = {
      ...RAW_ROW,
      acwr_ratio: null,
      risk_zone: "insufficient_data",
    };
    vi.mocked(prisma.$queryRaw).mockResolvedValue([nullRatioRow]);

    const result = await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);

    expect(result.history[0]!.acwrRatio).toBeNull();
    expect(result.history[0]!.riskZone).toBe("insufficient_data");
  });

  it("maps all numeric fields from integers correctly", async () => {
    const result = await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);

    const entry = result.history[0]!;
    expect(entry.dailyAu).toBe(420);
    expect(entry.acuteLoadAu).toBe(2100);
    expect(entry.acuteWindowDays).toBe(5);
    expect(entry.chronicWindowDays).toBe(20);
  });

  it("passes the correct days-based cutoff date to the raw query", async () => {
    const before = new Date();
    before.setUTCDate(before.getUTCDate() - 28);

    await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID, 28);

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("defaults to 28 days when days param is not provided", async () => {
    await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("calls withTenantSchema (uses $transaction)", async () => {
    await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("uses the executeRawUnsafe to set search_path inside the transaction", async () => {
    await getAthleteAcwr(prisma, CLUB_ID, ATHLETE_ID);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`clube_${CLUB_ID}`),
    );
  });
});
