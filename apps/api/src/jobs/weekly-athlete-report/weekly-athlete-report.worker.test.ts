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
  data: {
    clubId: string;
    triggeredAt: string;
    weekKey: string;
  };
  attemptsMade: number;
  opts: { attempts?: number };
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

const mockSendWeeklyAthleteReports = vi.fn();
vi.mock("../../modules/workload/weekly-report.service.js", () => ({
  sendWeeklyAthleteReports: (...args: unknown[]) =>
    mockSendWeeklyAthleteReports(...args),
}));

import { startWeeklyAthleteReportWorker } from "./weekly-athlete-report.worker.js";
import { WEEKLY_ATHLETE_REPORT_JOB_NAMES } from "./weekly-athlete-report.types.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-weekly-send-001",
    name: WEEKLY_ATHLETE_REPORT_JOB_NAMES.SEND_CLUB_WEEKLY_REPORT,
    data: {
      clubId: "club-abc",
      triggeredAt: "2025-06-09T08:00:00.000Z",
      weekKey: "2025-W24",
    },
    attemptsMade: 1,
    opts: { attempts: 2 },
    log: vi.fn(),
    ...overrides,
  };
}

function makeReportResult(overrides = {}) {
  return {
    clubId: "club-abc",
    weekKey: "2025-W24",
    athletesProcessed: 5,
    sent: 3,
    skipped: 1,
    failed: 1,
    durationMs: 250,
    ...overrides,
  };
}

describe("startWeeklyAthleteReportWorker — processor function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startWeeklyAthleteReportWorker();
  });

  it("returns undefined for non-send-club-weekly-report job names (guard clause)", async () => {
    const job = makeJob({
      name: WEEKLY_ATHLETE_REPORT_JOB_NAMES.DISPATCH_WEEKLY_ATHLETE_REPORT,
    });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockSendWeeklyAthleteReports).not.toHaveBeenCalled();
  });

  it("calls sendWeeklyAthleteReports with prisma, clubId, weekKey, and triggeredAt", async () => {
    mockSendWeeklyAthleteReports.mockResolvedValueOnce(makeReportResult());

    await capturedProcessor!(makeJob());

    expect(mockSendWeeklyAthleteReports).toHaveBeenCalledWith(
      {},
      "club-abc",
      "2025-W24",
      "2025-06-09T08:00:00.000Z",
    );
  });

  it("returns the result from sendWeeklyAthleteReports on success", async () => {
    const expected = makeReportResult({ sent: 4, skipped: 0, failed: 1 });
    mockSendWeeklyAthleteReports.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("returns result with sent: 0 when all athletes are skipped", async () => {
    const expected = makeReportResult({ sent: 0, skipped: 5, failed: 0 });
    mockSendWeeklyAthleteReports.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("logs a start message and a completion summary", async () => {
    const job = makeJob();
    mockSendWeeklyAthleteReports.mockResolvedValueOnce(
      makeReportResult({ sent: 3, skipped: 1, failed: 1, durationMs: 120 }),
    );

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(2);
    const firstCall = job.log.mock.calls.at(0)?.at(0) as string;
    const secondCall = job.log.mock.calls.at(1)?.at(0) as string;
    expect(firstCall).toContain("club-abc");
    expect(firstCall).toContain("starting weekly athlete report");
    expect(firstCall).toContain("2025-W24");
    expect(secondCall).toContain("sent=3");
    expect(secondCall).toContain("skipped=1");
    expect(secondCall).toContain("failed=1");
    expect(secondCall).toContain("durationMs=120ms");
  });

  it("re-throws errors from sendWeeklyAthleteReports (DB errors → BullMQ retries)", async () => {
    mockSendWeeklyAthleteReports.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "DB connection lost",
    );
  });

  it("re-throws permission errors from the query", async () => {
    mockSendWeeklyAthleteReports.mockRejectedValueOnce(
      new Error("permission denied for table workload_metrics"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "permission denied for table workload_metrics",
    );
  });

  it("uses the correct clubId from job.data for different clubs", async () => {
    const job = makeJob({
      data: {
        clubId: "club-xyz",
        triggeredAt: "2025-06-09T08:00:00.000Z",
        weekKey: "2025-W24",
      },
    });
    mockSendWeeklyAthleteReports.mockResolvedValueOnce(
      makeReportResult({ clubId: "club-xyz" }),
    );

    await capturedProcessor!(job);

    expect(mockSendWeeklyAthleteReports).toHaveBeenCalledWith(
      {},
      "club-xyz",
      "2025-W24",
      "2025-06-09T08:00:00.000Z",
    );
  });

  it("logs the club ID in the start message", async () => {
    const job = makeJob({
      data: {
        clubId: "club-specific-id",
        triggeredAt: "2025-06-09T08:00:00.000Z",
        weekKey: "2025-W24",
      },
    });
    mockSendWeeklyAthleteReports.mockResolvedValueOnce(makeReportResult());

    await capturedProcessor!(job);

    const firstCall = job.log.mock.calls.at(0)?.at(0) as string;
    expect(firstCall).toContain("club-specific-id");
  });
});

describe("startWeeklyAthleteReportWorker — completed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCompletedHandler = null;
    startWeeklyAthleteReportWorker();
  });

  it("completed handler is registered on the worker", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("logs completion summary with sent, skipped, failed, and durationMs", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();
    const result = makeReportResult({
      sent: 3,
      skipped: 1,
      failed: 1,
      durationMs: 200,
    });

    capturedCompletedHandler!(job, result);

    expect(consoleSpy).toHaveBeenCalled();
    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("sent: 3");
    expect(logMessage).toContain("skipped: 1");
    expect(logMessage).toContain("failed: 1");
    expect(logMessage).toContain("durationMs: 200ms");
    consoleSpy.mockRestore();
  });

  it("includes the club ID in the completion log", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, makeReportResult());

    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("club-abc");
    consoleSpy.mockRestore();
  });

  it("includes the weekKey in the completion log", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, makeReportResult({ weekKey: "2025-W24" }));

    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("2025-W24");
    consoleSpy.mockRestore();
  });

  it("does not throw when result is undefined", () => {
    const job = makeJob();
    expect(() => capturedCompletedHandler!(job, undefined)).not.toThrow();
  });

  it("does not log anything when result is undefined", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, undefined);

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("startWeeklyAthleteReportWorker — failed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFailedHandler = null;
    startWeeklyAthleteReportWorker();
  });

  it("failed handler is registered on the worker", () => {
    expect(capturedFailedHandler).not.toBeNull();
  });

  it("does not throw when job is undefined (safe guard)", () => {
    expect(() =>
      capturedFailedHandler!(undefined, new Error("orphan")),
    ).not.toThrow();
  });

  it("logs error info including club ID and error message", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const job = makeJob({ attemptsMade: 1 });

    capturedFailedHandler!(job, new Error("DB connection lost"));

    expect(consoleSpy).toHaveBeenCalled();
    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("club-abc");
    expect(logMessage).toContain("DB connection lost");
    consoleSpy.mockRestore();
  });

  it("includes attemptsMade in the error log", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const job = makeJob({ attemptsMade: 2 });

    capturedFailedHandler!(job, new Error("timeout"));

    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("2");
    consoleSpy.mockRestore();
  });
});

describe("startWeeklyAthleteReportWorker — worker configuration", () => {
  it("registers a Worker on the weekly-athlete-report queue with concurrency 3", async () => {
    vi.clearAllMocks();
    startWeeklyAthleteReportWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "weekly-athlete-report",
      expect.any(Function),
      expect.objectContaining({ concurrency: 3 }),
    );
  });
});
