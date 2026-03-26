import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  recordWorkloadMetric,
  AthleteNotFoundError,
} from "./workload.service.js";

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
      findFirst: vi.fn(),
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
const IDEMPOTENCY_KEY = "aabbccddeeff00112233445566778899";

const BASE_INPUT = {
  athleteId: ATHLETE_ID,
  date: "2024-06-01",
  rpe: 7,
  durationMinutes: 60,
  sessionType: "TRAINING" as const,
};

const METRIC_ROW = {
  id: "metric_001",
  athleteId: ATHLETE_ID,
  date: new Date("2024-06-01"),
  rpe: 7,
  durationMinutes: 60,
  sessionType: "TRAINING",
  notes: null,
  idempotencyKey: IDEMPOTENCY_KEY,
  createdAt: new Date("2024-06-01T10:00:00Z"),
  updatedAt: new Date("2024-06-01T10:00:00Z"),
  trainingSessionId: null,
};

describe("recordWorkloadMetric() — idempotency", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.workloadMetric.create).mockResolvedValue(
      METRIC_ROW as never,
    );
    vi.mocked(prisma.workloadMetric.findFirst).mockResolvedValue(null);
  });

  it("returns existing metric when idempotencyKey already exists (no duplicate insert)", async () => {
    vi.mocked(prisma.workloadMetric.findFirst).mockResolvedValue(
      METRIC_ROW as never,
    );

    const result = await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(result.id).toBe("metric_001");
    expect(result.trainingLoadAu).toBe(7 * 60);
    expect(prisma.workloadMetric.create).not.toHaveBeenCalled();
  });

  it("does not write an audit log entry when returning an existing record", async () => {
    vi.mocked(prisma.workloadMetric.findFirst).mockResolvedValue(
      METRIC_ROW as never,
    );

    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("creates a new metric when idempotencyKey is absent", async () => {
    const result = await recordWorkloadMetric(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      BASE_INPUT,
    );

    expect(prisma.workloadMetric.findFirst).not.toHaveBeenCalled();
    expect(prisma.workloadMetric.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("metric_001");
  });

  it("creates a new metric when idempotencyKey is unique (not found)", async () => {
    vi.mocked(prisma.workloadMetric.findFirst).mockResolvedValue(null);

    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(prisma.workloadMetric.create).toHaveBeenCalledOnce();
  });

  it("stores idempotencyKey in the new metric record", async () => {
    vi.mocked(prisma.workloadMetric.findFirst).mockResolvedValue(null);

    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(prisma.workloadMetric.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: IDEMPOTENCY_KEY }),
      }),
    );
  });

  it("stores null for idempotencyKey when not provided", async () => {
    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);

    expect(prisma.workloadMetric.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: null }),
      }),
    );
  });

  it("checks idempotencyKey before checking athlete existence", async () => {
    const callOrder: string[] = [];

    vi.mocked(prisma.workloadMetric.findFirst).mockImplementation((async () => {
      callOrder.push("findFirst");
      return METRIC_ROW;
    }) as unknown as typeof prisma.workloadMetric.findFirst);

    vi.mocked(prisma.athlete.findUnique).mockImplementation((async () => {
      callOrder.push("findUnique");
      return { id: ATHLETE_ID };
    }) as unknown as typeof prisma.athlete.findUnique);

    await recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      idempotencyKey: IDEMPOTENCY_KEY,
    });

    expect(callOrder).toEqual(["findFirst"]);
    expect(prisma.athlete.findUnique).not.toHaveBeenCalled();
  });
  it("still throws AthleteNotFoundError when key is new and athlete missing", async () => {
    vi.mocked(prisma.workloadMetric.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(null);

    await expect(
      recordWorkloadMetric(prisma, CLUB_ID, ACTOR_ID, {
        ...BASE_INPUT,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toThrowError(AthleteNotFoundError);
  });
});
