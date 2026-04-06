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
    purgeBeforeIso: string;
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

const mockPurgeExpiredConsentRecords = vi.fn();
vi.mock("./lgpd-purge.service.js", () => ({
  purgeExpiredConsentRecords: (...args: unknown[]) =>
    mockPurgeExpiredConsentRecords(...args),
}));

import { startLgpdPurgeWorker } from "./lgpd-purge.worker.js";
import { LGPD_PURGE_JOB_NAMES } from "./lgpd-purge.types.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-lgpd-purge-001",
    name: LGPD_PURGE_JOB_NAMES.PURGE_CLUB_CONSENT,
    data: {
      clubId: "club-abc",
      triggeredAt: "2025-03-01T03:00:00.000Z",
      purgeBeforeIso: "2023-03-01T00:00:00.000Z",
    },
    attemptsMade: 1,
    opts: { attempts: 2 },
    log: vi.fn(),
    ...overrides,
  };
}

function makePurgeResult(overrides = {}) {
  return {
    clubId: "club-abc",
    deleted: 5,
    purgedBefore: new Date("2023-03-01T00:00:00.000Z"),
    durationMs: 42,
    ...overrides,
  };
}

describe("startLgpdPurgeWorker — processor function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startLgpdPurgeWorker();
  });

  it("returns undefined for non-purge-club-consent job names (guard clause)", async () => {
    const job = makeJob({ name: LGPD_PURGE_JOB_NAMES.DISPATCH_LGPD_PURGE });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockPurgeExpiredConsentRecords).not.toHaveBeenCalled();
  });

  it("calls purgeExpiredConsentRecords with prisma, clubId, and parsed purgeBefore Date", async () => {
    mockPurgeExpiredConsentRecords.mockResolvedValueOnce(makePurgeResult());

    await capturedProcessor!(makeJob());

    expect(mockPurgeExpiredConsentRecords).toHaveBeenCalledWith(
      {},
      "club-abc",
      new Date("2023-03-01T00:00:00.000Z"),
    );
  });

  it("returns the result from purgeExpiredConsentRecords", async () => {
    const expected = makePurgeResult({ deleted: 3, durationMs: 25 });
    mockPurgeExpiredConsentRecords.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("returns result with deleted: 0 when no rows were purged", async () => {
    const expected = makePurgeResult({ deleted: 0 });
    mockPurgeExpiredConsentRecords.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("logs a start message and a completion summary", async () => {
    const job = makeJob();
    mockPurgeExpiredConsentRecords.mockResolvedValueOnce(
      makePurgeResult({ deleted: 7, durationMs: 55 }),
    );

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(2);
    const firstCall = job.log.mock.calls.at(0)?.at(0) as string;
    const secondCall = job.log.mock.calls.at(1)?.at(0) as string;
    expect(firstCall).toContain("club-abc");
    expect(firstCall).toContain("starting consent purge");
    expect(secondCall).toContain("deleted 7");
    expect(secondCall).toContain("55ms");
  });

  it("re-throws errors from purgeExpiredConsentRecords (DB errors → BullMQ retries)", async () => {
    mockPurgeExpiredConsentRecords.mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "DB connection lost",
    );
  });

  it("re-throws permission errors from the DELETE statement", async () => {
    mockPurgeExpiredConsentRecords.mockRejectedValueOnce(
      new Error("permission denied for table audit_log"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "permission denied for table audit_log",
    );
  });

  it("uses the correct clubId from job.data for different clubs", async () => {
    const job = makeJob({
      data: {
        clubId: "club-xyz",
        triggeredAt: "2025-03-01T03:00:00.000Z",
        purgeBeforeIso: "2023-03-01T00:00:00.000Z",
      },
    });
    mockPurgeExpiredConsentRecords.mockResolvedValueOnce(
      makePurgeResult({ clubId: "club-xyz" }),
    );

    await capturedProcessor!(job);

    expect(mockPurgeExpiredConsentRecords).toHaveBeenCalledWith(
      {},
      "club-xyz",
      new Date("2023-03-01T00:00:00.000Z"),
    );
  });

  it("parses purgeBeforeIso string into a Date before calling the service", async () => {
    mockPurgeExpiredConsentRecords.mockResolvedValueOnce(makePurgeResult());

    const job = makeJob({
      data: {
        clubId: "club-abc",
        triggeredAt: "2025-03-01T03:00:00.000Z",
        purgeBeforeIso: "2023-06-15T00:00:00.000Z",
      },
    });

    await capturedProcessor!(job);

    const passedDate = mockPurgeExpiredConsentRecords.mock.calls[0]?.[2];
    expect(passedDate).toBeInstanceOf(Date);
    expect((passedDate as Date).toISOString()).toBe("2023-06-15T00:00:00.000Z");
  });
});

describe("startLgpdPurgeWorker — completed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCompletedHandler = null;
    startLgpdPurgeWorker();
  });

  it("completed handler is registered on the worker", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("logs deleted count and durationMs when result is present", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();
    const result = makePurgeResult({ deleted: 12, durationMs: 88 });

    capturedCompletedHandler!(job, result);

    expect(consoleSpy).toHaveBeenCalled();
    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("deleted: 12");
    expect(logMessage).toContain("durationMs: 88ms");
    consoleSpy.mockRestore();
  });

  it("includes the club ID in the completion log", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, makePurgeResult());

    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("club-abc");
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

  it("logs deleted: 0 when no records were purged", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, makePurgeResult({ deleted: 0 }));

    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("deleted: 0");
    consoleSpy.mockRestore();
  });
});

describe("startLgpdPurgeWorker — failed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFailedHandler = null;
    startLgpdPurgeWorker();
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

describe("startLgpdPurgeWorker — worker configuration", () => {
  it("registers a Worker on the lgpd-purge queue with concurrency 3", async () => {
    vi.clearAllMocks();
    startLgpdPurgeWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "lgpd-purge",
      expect.any(Function),
      expect.objectContaining({ concurrency: 3 }),
    );
  });
});
