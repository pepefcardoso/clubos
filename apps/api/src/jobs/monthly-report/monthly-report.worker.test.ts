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
    reportPeriod: string;
    periodStart: string;
    periodEnd: string;
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

const mockGenerateAndSendMonthlyReport = vi.fn();
vi.mock("./monthly-report.service.js", () => ({
  generateAndSendMonthlyReport: (...args: unknown[]) =>
    mockGenerateAndSendMonthlyReport(...args),
}));

import { startMonthlyReportWorker } from "./monthly-report.worker.js";
import { MONTHLY_REPORT_JOB_NAMES } from "./monthly-report.types.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-001",
    name: MONTHLY_REPORT_JOB_NAMES.GENERATE_CLUB_MONTHLY_REPORT,
    data: {
      clubId: "club-abc",
      reportPeriod: "2025-03",
      periodStart: "2025-03-01T00:00:00.000Z",
      periodEnd: "2025-03-31T23:59:59.999Z",
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
    reportPeriod: "2025-03",
    adminCount: 2,
    emailsSent: 2,
    emailsFailed: 0,
    skipped: false,
    ...overrides,
  };
}

describe("startMonthlyReportWorker — processor function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startMonthlyReportWorker();
  });

  it("returns undefined for non-matching job names (guard clause)", async () => {
    const job = makeJob({ name: "dispatch-monthly-report" });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockGenerateAndSendMonthlyReport).not.toHaveBeenCalled();
  });

  it("calls generateAndSendMonthlyReport with parsed Date objects from ISO strings", async () => {
    mockGenerateAndSendMonthlyReport.mockResolvedValueOnce(makeReportResult());

    await capturedProcessor!(makeJob());

    expect(mockGenerateAndSendMonthlyReport).toHaveBeenCalledWith(
      {},
      "club-abc",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );
  });

  it("returns the result from generateAndSendMonthlyReport on success", async () => {
    const expected = makeReportResult({ emailsSent: 3, adminCount: 3 });
    mockGenerateAndSendMonthlyReport.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("logs start and summary messages", async () => {
    const job = makeJob();
    mockGenerateAndSendMonthlyReport.mockResolvedValueOnce(
      makeReportResult({ emailsSent: 2, adminCount: 2 }),
    );

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(2);
    const firstCall = job.log.mock.calls.at(0)?.at(0) as string;
    const secondCall = job.log.mock.calls.at(1)?.at(0) as string;
    expect(firstCall).toContain("club-abc");
    expect(firstCall).toContain("2025-03");
    expect(secondCall).toContain("sent: 2");
    expect(secondCall).toContain("admins: 2");
  });

  it("logs skip reason when result is skipped", async () => {
    const job = makeJob();
    mockGenerateAndSendMonthlyReport.mockResolvedValueOnce(
      makeReportResult({
        skipped: true,
        skipReason: "no admin emails",
        adminCount: 0,
        emailsSent: 0,
      }),
    );

    await capturedProcessor!(job);

    const secondCall = job.log.mock.calls.at(1)?.at(0) as string;
    expect(secondCall).toContain("no admin emails");
    expect(secondCall).toContain("skipped: true");
  });

  it("completes successfully and returns result even when some emails failed", async () => {
    const result = makeReportResult({
      emailsSent: 1,
      emailsFailed: 1,
    });
    mockGenerateAndSendMonthlyReport.mockResolvedValueOnce(result);

    const returnedResult = await capturedProcessor!(makeJob());
    expect(returnedResult).toEqual(result);
  });

  it("warns when emailsFailed > 0", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockGenerateAndSendMonthlyReport.mockResolvedValueOnce(
      makeReportResult({ emailsSent: 1, emailsFailed: 1 }),
    );

    await capturedProcessor!(makeJob());

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("re-throws errors from generateAndSendMonthlyReport (e.g. PDF generation failure)", async () => {
    mockGenerateAndSendMonthlyReport.mockRejectedValueOnce(
      new Error("PDFKit stream error"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "PDFKit stream error",
    );
  });

  it("re-throws DB errors from generateAndSendMonthlyReport", async () => {
    mockGenerateAndSendMonthlyReport.mockRejectedValueOnce(
      new Error("Connection reset by peer"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "Connection reset by peer",
    );
  });
});

describe("startMonthlyReportWorker — failed event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startMonthlyReportWorker();
  });

  it("failed handler is registered on the worker", () => {
    expect(capturedFailedHandler).not.toBeNull();
  });

  it("does not throw when job is undefined (safe guard)", () => {
    expect(() =>
      capturedFailedHandler!(undefined, new Error("orphan")),
    ).not.toThrow();
  });

  it("logs club and attempt info on failure", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const job = makeJob({ attemptsMade: 1, opts: { attempts: 2 } });

    capturedFailedHandler!(job, new Error("Resend quota exceeded"));

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("startMonthlyReportWorker — completed event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startMonthlyReportWorker();
  });

  it("completed handler is registered on the worker", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("logs completion summary when result is defined", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();
    const result = makeReportResult({ emailsSent: 2, adminCount: 2 });

    capturedCompletedHandler!(job, result);

    expect(consoleSpy).toHaveBeenCalled();
    const logArgs = consoleSpy.mock.calls.at(0) as string[];
    const logMessage = logArgs.join(" ");
    expect(logMessage).toContain("sent: 2");
    expect(logMessage).toContain("2025-03");
    consoleSpy.mockRestore();
  });

  it("does not throw when result is undefined", () => {
    const job = makeJob();
    expect(() => capturedCompletedHandler!(job, undefined)).not.toThrow();
  });
});

describe("startMonthlyReportWorker — worker configuration", () => {
  it("registers a Worker on the monthly-report queue with concurrency 3", async () => {
    vi.clearAllMocks();
    startMonthlyReportWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "monthly-report",
      expect.any(Function),
      expect.objectContaining({ concurrency: 3 }),
    );
  });
});
