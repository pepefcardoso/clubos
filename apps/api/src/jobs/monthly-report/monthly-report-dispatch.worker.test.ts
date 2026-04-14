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

interface MockJob {
  id: string;
  name: string;
  data: { targetDate?: string };
  attemptsMade: number;
  log: ReturnType<typeof vi.fn>;
}

type ProcessorFn = (job: MockJob) => Promise<unknown>;
type FailedHandlerFn = (job: MockJob | undefined, err: Error) => void;
type CompletedHandlerFn = (job: MockJob, result: unknown) => void;

let capturedProcessor: ProcessorFn | null = null;
let capturedFailedHandler: FailedHandlerFn | null = null;
let capturedCompletedHandler: CompletedHandlerFn | null = null;

vi.mock("bullmq", () => ({
  Worker: vi.fn(function (_queueName: string, processor: ProcessorFn) {
    capturedProcessor = processor;
    return {
      on: vi.fn((event: string, handler: unknown) => {
        if (event === "failed")
          capturedFailedHandler = handler as FailedHandlerFn;
        if (event === "completed")
          capturedCompletedHandler = handler as CompletedHandlerFn;
      }),
      close: vi.fn(),
    };
  }),
}));

const mockAddBulk = vi.fn().mockResolvedValue([]);
vi.mock("../queues.js", () => ({
  monthlyReportQueue: {
    addBulk: (...args: unknown[]) => mockAddBulk(...args),
  },
}));

const mockFindManyClubs = vi.fn();
vi.mock("../../lib/prisma.js", () => ({
  getPrismaClient: vi.fn().mockReturnValue({
    club: {
      findMany: (...args: unknown[]) => mockFindManyClubs(...args),
    },
  }),
}));

import { startMonthlyReportDispatchWorker } from "./monthly-report-dispatch.worker.js";
import { MONTHLY_REPORT_JOB_NAMES } from "./monthly-report.types.js";

function makeDispatchJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "dispatch-job-001",
    name: MONTHLY_REPORT_JOB_NAMES.DISPATCH_MONTHLY_REPORT,
    data: {},
    attemptsMade: 1,
    log: vi.fn(),
    ...overrides,
  };
}

describe("startMonthlyReportDispatchWorker — processor function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startMonthlyReportDispatchWorker();
  });

  it("returns undefined for non-dispatch job names (guard clause)", async () => {
    const job = makeDispatchJob({
      name: MONTHLY_REPORT_JOB_NAMES.GENERATE_CLUB_MONTHLY_REPORT,
    });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockFindManyClubs).not.toHaveBeenCalled();
  });

  it("returns { dispatched: 0 } and does not call addBulk when no clubs exist", async () => {
    mockFindManyClubs.mockResolvedValueOnce([]);

    const result = await capturedProcessor!(makeDispatchJob());

    expect(result).toEqual({ dispatched: 0 });
    expect(mockAddBulk).not.toHaveBeenCalled();
  });

  it("enqueues one job per club with stable monthly-report- jobId prefix", async () => {
    const clubs = [
      { id: "club-aaa", name: "Clube A" },
      { id: "club-bbb", name: "Clube B" },
      { id: "club-ccc", name: "Clube C" },
    ];
    mockFindManyClubs.mockResolvedValueOnce(clubs);
    const job = makeDispatchJob({
      data: { targetDate: "2025-04-02T07:00:00.000Z" },
    });

    const result = await capturedProcessor!(job);

    expect(result).toEqual(
      expect.objectContaining({ dispatched: 3, targetDate: "2025-03" }),
    );
    expect(mockAddBulk).toHaveBeenCalledOnce();

    const bulkJobs = mockAddBulk.mock.calls[0]![0] as Array<{
      name: string;
      data: {
        clubId: string;
        reportPeriod: string;
        periodStart: string;
        periodEnd: string;
      };
      opts: { jobId: string };
    }>;
    expect(bulkJobs).toHaveLength(3);

    for (const bulkJob of bulkJobs) {
      expect(bulkJob.name).toBe(
        MONTHLY_REPORT_JOB_NAMES.GENERATE_CLUB_MONTHLY_REPORT,
      );
      expect(bulkJob.opts.jobId).toMatch(
        /^monthly-report-club-[a-z]+-2025-03$/,
      );
    }

    const clubIds = bulkJobs.map((j) => j.data.clubId);
    expect(clubIds).toContain("club-aaa");
    expect(clubIds).toContain("club-bbb");
    expect(clubIds).toContain("club-ccc");
  });

  it("uses injected targetDate to compute the previous month correctly (April → March)", async () => {
    mockFindManyClubs.mockResolvedValueOnce([{ id: "club-xyz", name: "Test" }]);
    const job = makeDispatchJob({
      data: { targetDate: "2025-04-02T07:00:00.000Z" },
    });

    const result = await capturedProcessor!(job);

    expect(result).toEqual(expect.objectContaining({ targetDate: "2025-03" }));

    const bulkJobs = mockAddBulk.mock.calls[0]![0] as Array<{
      opts: { jobId: string };
      data: { reportPeriod: string; periodStart: string; periodEnd: string };
    }>;
    expect(bulkJobs[0]?.opts.jobId).toBe("monthly-report-club-xyz-2025-03");
    expect(bulkJobs[0]?.data.reportPeriod).toBe("2025-03");
    expect(bulkJobs[0]?.data.periodStart).toBe("2025-03-01T00:00:00.000Z");
    expect(bulkJobs[0]?.data.periodEnd).toBe("2025-03-31T23:59:59.999Z");
  });

  it("handles year boundary correctly: January targetDate → December of prior year", async () => {
    mockFindManyClubs.mockResolvedValueOnce([{ id: "club-xyz", name: "Test" }]);
    const job = makeDispatchJob({
      data: { targetDate: "2025-01-02T07:00:00.000Z" },
    });

    const result = await capturedProcessor!(job);

    expect(result).toEqual(expect.objectContaining({ targetDate: "2024-12" }));

    const bulkJobs = mockAddBulk.mock.calls[0]![0] as Array<{
      opts: { jobId: string };
      data: { reportPeriod: string; periodStart: string; periodEnd: string };
    }>;
    expect(bulkJobs[0]?.opts.jobId).toBe("monthly-report-club-xyz-2024-12");
    expect(bulkJobs[0]?.data.reportPeriod).toBe("2024-12");
    expect(bulkJobs[0]?.data.periodStart).toBe("2024-12-01T00:00:00.000Z");
    expect(bulkJobs[0]?.data.periodEnd).toBe("2024-12-31T23:59:59.999Z");
  });

  it("jobId uses the previous month, not the current month", async () => {
    mockFindManyClubs.mockResolvedValueOnce([{ id: "club-xyz", name: "Test" }]);
    const job = makeDispatchJob({
      data: { targetDate: "2025-06-02T07:00:00.000Z" },
    });

    await capturedProcessor!(job);

    const bulkJobs = mockAddBulk.mock.calls[0]![0] as Array<{
      opts: { jobId: string };
    }>;
    expect(bulkJobs[0]?.opts.jobId).toContain("2025-05");
    expect(bulkJobs[0]?.opts.jobId).not.toContain("2025-06");
  });

  it("logs start, period, club count, and enqueued count", async () => {
    mockFindManyClubs.mockResolvedValueOnce([{ id: "club-abc", name: "ABC" }]);
    const job = makeDispatchJob({
      data: { targetDate: "2025-04-02T07:00:00.000Z" },
    });

    await capturedProcessor!(job);

    const logCalls = job.log.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(logCalls.some((msg) => msg.includes("Starting"))).toBe(true);
    expect(logCalls.some((msg) => msg.includes("2025-03"))).toBe(true);
    expect(logCalls.some((msg) => msg.includes("1 clubs"))).toBe(true);
    expect(logCalls.some((msg) => msg.includes("Enqueued 1"))).toBe(true);
  });
});

describe("startMonthlyReportDispatchWorker — event handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startMonthlyReportDispatchWorker();
  });

  it("completed handler is registered", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("failed handler is registered and does not throw when job is undefined", () => {
    expect(capturedFailedHandler).not.toBeNull();
    expect(() =>
      capturedFailedHandler!(undefined, new Error("crash")),
    ).not.toThrow();
  });

  it("logs completion when completed handler fires", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeDispatchJob();
    capturedCompletedHandler!(job, { dispatched: 5, targetDate: "2025-03" });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("startMonthlyReportDispatchWorker — worker configuration", () => {
  it("registers a Worker on the monthly-report queue with concurrency 1", async () => {
    vi.clearAllMocks();
    startMonthlyReportDispatchWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "monthly-report",
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
  });
});
