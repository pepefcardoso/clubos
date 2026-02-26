import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    status: "ready",
  }),
}));

vi.mock("../../lib/prisma.js", () => ({
  getPrismaClient: vi.fn().mockReturnValue({}),
}));

vi.mock("../queues.js", () => ({
  chargeGenerationQueue: {
    add: vi.fn(),
    addBulk: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  },
}));

let capturedProcessor: ((job: MockJob) => Promise<unknown>) | null = null;

vi.mock("bullmq", () => ({
  Worker: vi
    .fn()
    .mockImplementation(
      (_queueName: string, processor: (job: MockJob) => Promise<unknown>) => {
        capturedProcessor = processor;
        return {
          on: vi.fn(),
          close: vi.fn(),
        };
      },
    ),
}));

const mockGenerateMonthlyCharges = vi.fn();
const MockNoActivePlanError = class NoActivePlanError extends Error {
  constructor() {
    super("O clube não possui nenhum plano ativo.");
    this.name = "NoActivePlanError";
  }
};

vi.mock("../../modules/charges/charges.service.js", () => ({
  generateMonthlyCharges: mockGenerateMonthlyCharges,
  NoActivePlanError: MockNoActivePlanError,
}));

import { startChargeGenerationWorker } from "./charge-generation.worker.js";
import { JOB_NAMES } from "./charge-generation.types.js";

interface MockJob {
  id: string;
  name: string;
  data: {
    clubId: string;
    actorId: string;
    billingPeriod?: string;
  };
  attemptsMade: number;
  log: ReturnType<typeof vi.fn>;
}

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-001",
    name: JOB_NAMES.GENERATE_CLUB_CHARGES,
    data: { clubId: "club-abc", actorId: "system:cron" },
    attemptsMade: 1,
    log: vi.fn(),
    ...overrides,
  };
}

function makeSuccessResult(overrides = {}) {
  return {
    generated: 3,
    skipped: 1,
    errors: [],
    gatewayErrors: [],
    charges: [],
    ...overrides,
  };
}

describe("startChargeGenerationWorker — processor function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    startChargeGenerationWorker();
  });

  it("returns undefined for non-generation job names (guard clause)", async () => {
    const job = makeJob({ name: JOB_NAMES.DISPATCH_MONTHLY_CHARGES });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockGenerateMonthlyCharges).not.toHaveBeenCalled();
  });

  it("calls generateMonthlyCharges with correct arguments", async () => {
    const job = makeJob({
      data: {
        clubId: "club-xyz",
        actorId: "system:cron",
        billingPeriod: "2025-03-01T00:00:00.000Z",
      },
    });
    mockGenerateMonthlyCharges.mockResolvedValueOnce(makeSuccessResult());

    await capturedProcessor!(job);

    expect(mockGenerateMonthlyCharges).toHaveBeenCalledWith(
      {},
      "club-xyz",
      "system:cron",
      { billingPeriod: "2025-03-01T00:00:00.000Z" },
    );
  });

  it("returns the result from generateMonthlyCharges on success", async () => {
    const expected = makeSuccessResult({ generated: 5, skipped: 2 });
    mockGenerateMonthlyCharges.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("calls generateMonthlyCharges without billingPeriod when not provided", async () => {
    const job = makeJob({
      data: { clubId: "club-abc", actorId: "system:cron" },
    });
    mockGenerateMonthlyCharges.mockResolvedValueOnce(makeSuccessResult());

    await capturedProcessor!(job);

    expect(mockGenerateMonthlyCharges).toHaveBeenCalledWith(
      {},
      "club-abc",
      "system:cron",
      { billingPeriod: undefined },
    );
  });

  it("re-throws NoActivePlanError so BullMQ can schedule a retry", async () => {
    mockGenerateMonthlyCharges.mockRejectedValueOnce(
      new MockNoActivePlanError(),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "O clube não possui nenhum plano ativo.",
    );
  });

  it("re-throws unexpected errors so BullMQ can schedule a retry", async () => {
    mockGenerateMonthlyCharges.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "DB connection lost",
    );
  });

  it("completes successfully when result.errors is non-empty (per-member failures are non-fatal)", async () => {
    const result = makeSuccessResult({
      generated: 2,
      errors: [{ memberId: "m1", reason: "DB timeout" }],
    });
    mockGenerateMonthlyCharges.mockResolvedValueOnce(result);

    const returnedResult = await capturedProcessor!(makeJob());
    expect(returnedResult).toEqual(result);
  });

  it("completes successfully when result.gatewayErrors is non-empty (gateway failures are non-fatal)", async () => {
    const result = makeSuccessResult({
      generated: 2,
      gatewayErrors: [{ chargeId: "c1", memberId: "m1", reason: "Asaas 503" }],
    });
    mockGenerateMonthlyCharges.mockResolvedValueOnce(result);

    const returnedResult = await capturedProcessor!(makeJob());
    expect(returnedResult).toEqual(result);
  });

  it("logs a message at job start and a summary at completion", async () => {
    const job = makeJob();
    mockGenerateMonthlyCharges.mockResolvedValueOnce(
      makeSuccessResult({ generated: 4, skipped: 1 }),
    );

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(2);

    const firstCall = job.log.mock.calls.at(0)?.at(0) as string | undefined;
    const secondCall = job.log.mock.calls.at(1)?.at(0) as string | undefined;
    expect(firstCall).toContain("starting charge generation");
    expect(secondCall).toContain("generated: 4");
    expect(secondCall).toContain("skipped: 1");
  });

  it("logs a message when NoActivePlanError is caught before re-throwing", async () => {
    mockGenerateMonthlyCharges.mockRejectedValueOnce(
      new MockNoActivePlanError(),
    );
    const job = makeJob();

    await expect(capturedProcessor!(job)).rejects.toThrow();

    const logCalls = job.log.mock.calls.map((c: Array<string | undefined>) =>
      c.at(0),
    );
    expect(
      logCalls.some((msg) => msg?.includes("no active plan") ?? false),
    ).toBe(true);
  });
});
