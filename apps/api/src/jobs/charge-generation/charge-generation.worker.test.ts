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
let capturedFailedHandler:
  | ((job: MockJob | undefined, err: Error) => void | Promise<void>)
  | null = null;

vi.mock("bullmq", () => ({
  Worker: vi
    .fn()
    .mockImplementation(
      (_queueName: string, processor: (job: MockJob) => Promise<unknown>) => {
        capturedProcessor = processor;
        return {
          on: vi.fn((event: string, handler: unknown) => {
            if (event === "failed") {
              capturedFailedHandler = handler as typeof capturedFailedHandler;
            }
          }),
          close: vi.fn(),
        };
      },
    ),
}));

const mockGenerateMonthlyCharges = vi.fn();
const mockMarkChargesPendingRetry = vi.fn().mockResolvedValue({ updated: 0 });
const MockNoActivePlanError = class NoActivePlanError extends Error {
  constructor() {
    super("O clube não possui nenhum plano ativo.");
    this.name = "NoActivePlanError";
  }
};

vi.mock("../../modules/charges/charges.service.js", () => ({
  generateMonthlyCharges: mockGenerateMonthlyCharges,
  markChargesPendingRetry: mockMarkChargesPendingRetry,
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
  opts: { attempts?: number };
  log: ReturnType<typeof vi.fn>;
}

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-001",
    name: JOB_NAMES.GENERATE_CLUB_CHARGES,
    data: { clubId: "club-abc", actorId: "system:cron" },
    attemptsMade: 1,
    opts: { attempts: 3 },
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
    capturedFailedHandler = null;
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

describe("startChargeGenerationWorker — failed event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    startChargeGenerationWorker();
  });

  it("calls markChargesPendingRetry when job is exhausted (attemptsMade >= attempts)", async () => {
    const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });

    await capturedFailedHandler!(job, new Error("DB failure"));

    expect(mockMarkChargesPendingRetry).toHaveBeenCalledWith(
      {},
      "club-abc",
      undefined,
    );
  });

  it("does NOT call markChargesPendingRetry on non-final failure", async () => {
    const job = makeJob({ attemptsMade: 1, opts: { attempts: 3 } });

    await capturedFailedHandler!(job, new Error("transient error"));

    expect(mockMarkChargesPendingRetry).not.toHaveBeenCalled();
  });

  it("does NOT call markChargesPendingRetry on second failure (still retryable)", async () => {
    const job = makeJob({ attemptsMade: 2, opts: { attempts: 3 } });

    await capturedFailedHandler!(job, new Error("second failure"));

    expect(mockMarkChargesPendingRetry).not.toHaveBeenCalled();
  });

  it("passes billingPeriod from job.data to markChargesPendingRetry", async () => {
    const job = makeJob({
      attemptsMade: 3,
      opts: { attempts: 3 },
      data: {
        clubId: "club-abc",
        actorId: "system:cron",
        billingPeriod: "2025-03-01T00:00:00.000Z",
      },
    });

    await capturedFailedHandler!(job, new Error("fail"));

    expect(mockMarkChargesPendingRetry).toHaveBeenCalledWith(
      {},
      "club-abc",
      "2025-03-01T00:00:00.000Z",
    );
  });

  it("does not throw when job is undefined (safe guard)", async () => {
    await expect(
      capturedFailedHandler!(undefined, new Error("orphan")),
    ).resolves.not.toThrow();

    expect(mockMarkChargesPendingRetry).not.toHaveBeenCalled();
  });

  it("does not propagate error when markChargesPendingRetry throws", async () => {
    mockMarkChargesPendingRetry.mockRejectedValueOnce(new Error("DB down"));
    const job = makeJob({ attemptsMade: 3, opts: { attempts: 3 } });

    await expect(
      capturedFailedHandler!(job, new Error("job fail")),
    ).resolves.not.toThrow();
  });

  it("uses default attempts (3) when job.opts.attempts is undefined", async () => {
    const job = makeJob({ attemptsMade: 3, opts: {} });

    await capturedFailedHandler!(job, new Error("no attempts opt"));

    expect(mockMarkChargesPendingRetry).toHaveBeenCalled();
  });
});

describe("charge generation backoff delays (T-024)", () => {
  const DELAYS_MS = [
    1 * 60 * 60 * 1000,
    6 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
  ] as const;

  const backoffStrategy = (attemptsMade: number): number =>
    DELAYS_MS[attemptsMade - 1] ?? 24 * 60 * 60 * 1000;

  it("returns 1h after first failure (attemptsMade=1)", () => {
    expect(backoffStrategy(1)).toBe(1 * 60 * 60 * 1000);
  });

  it("returns 6h after second failure (attemptsMade=2)", () => {
    expect(backoffStrategy(2)).toBe(6 * 60 * 60 * 1000);
  });

  it("returns 24h after third failure (attemptsMade=3)", () => {
    expect(backoffStrategy(3)).toBe(24 * 60 * 60 * 1000);
  });

  it("falls back to 24h for unexpected attempt counts", () => {
    expect(backoffStrategy(99)).toBe(24 * 60 * 60 * 1000);
    expect(backoffStrategy(0)).toBe(24 * 60 * 60 * 1000);
  });

  it("1h delay is less than 6h delay", () => {
    expect(backoffStrategy(1)).toBeLessThan(backoffStrategy(2));
  });

  it("6h delay is less than 24h delay", () => {
    expect(backoffStrategy(2)).toBeLessThan(backoffStrategy(3));
  });
});
