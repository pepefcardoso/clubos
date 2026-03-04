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
    targetDateStart: string;
    targetDateEnd: string;
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

const mockSendOverdueNoticesForClub = vi.fn();
vi.mock("./overdue-notice.service.js", () => ({
  sendOverdueNoticesForClub: (...args: unknown[]) =>
    mockSendOverdueNoticesForClub(...args),
}));

import { startOverdueNoticeWorker } from "./overdue-notice.worker.js";
import { OVERDUE_NOTICE_JOB_NAMES } from "./overdue-notice.types.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-002",
    name: OVERDUE_NOTICE_JOB_NAMES.SEND_CLUB_OVERDUE_NOTICES,
    data: {
      clubId: "club-xyz",
      targetDateStart: "2025-03-01T00:00:00.000Z",
      targetDateEnd: "2025-03-01T23:59:59.999Z",
    },
    attemptsMade: 1,
    opts: { attempts: 2 },
    log: vi.fn(),
    ...overrides,
  };
}

function makeOverdueResult(overrides = {}) {
  return {
    clubId: "club-xyz",
    sent: 2,
    skipped: 1,
    rateLimited: 0,
    emailFallbacks: 0,
    errors: [],
    ...overrides,
  };
}

describe("startOverdueNoticeWorker — processor function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startOverdueNoticeWorker();
  });

  it("returns undefined for non-send-club-overdue-notices job names (guard clause)", async () => {
    const job = makeJob({ name: "dispatch-overdue-notices" });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockSendOverdueNoticesForClub).not.toHaveBeenCalled();
  });

  it("calls sendOverdueNoticesForClub with parsed Date objects from ISO strings", async () => {
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(makeOverdueResult());

    await capturedProcessor!(makeJob());

    expect(mockSendOverdueNoticesForClub).toHaveBeenCalledWith(
      {},
      "club-xyz",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-01T23:59:59.999Z"),
    );
  });

  it("returns the result from sendOverdueNoticesForClub on success", async () => {
    const expected = makeOverdueResult({ sent: 4, skipped: 2 });
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("logs start and summary messages", async () => {
    const job = makeJob();
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({ sent: 3, skipped: 0, emailFallbacks: 2 }),
    );

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(2);
    const firstCall = job.log.mock.calls.at(0)?.at(0) as string;
    const secondCall = job.log.mock.calls.at(1)?.at(0) as string;
    expect(firstCall).toContain("club-xyz");
    expect(secondCall).toContain("sent: 3");
    expect(secondCall).toContain("skipped: 0");
    expect(secondCall).toContain("emailFallbacks: 2");
  });

  it("completes successfully when result.errors is non-empty (per-member failures are non-fatal)", async () => {
    const result = makeOverdueResult({
      sent: 1,
      errors: [{ chargeId: "c1", memberId: "m1", reason: "WA failed" }],
    });
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(result);

    const returnedResult = await capturedProcessor!(makeJob());
    expect(returnedResult).toEqual(result);
  });

  it("throws when ALL charges were rate-limited (sent=0, skipped=0, rateLimited>0)", async () => {
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({
        sent: 0,
        skipped: 0,
        rateLimited: 4,
        errors: Array.from({ length: 4 }, (_, i) => ({
          chargeId: `c${i}`,
          memberId: `m${i}`,
          reason: "Rate limited",
        })),
      }),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      /Rate limited for club club-xyz/,
    );
  });

  it("includes rateLimited count in the thrown error message", async () => {
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({
        sent: 0,
        skipped: 0,
        rateLimited: 7,
        errors: Array.from({ length: 7 }, (_, i) => ({
          chargeId: `c${i}`,
          memberId: `m${i}`,
          reason: "Rate limited",
        })),
      }),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      /7 overdue notice/,
    );
  });

  it("does NOT throw when some were sent despite some being rate-limited (partial batch)", async () => {
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({
        sent: 3,
        skipped: 0,
        rateLimited: 2,
        errors: [
          { chargeId: "c1", memberId: "m1", reason: "Rate limited" },
          { chargeId: "c2", memberId: "m2", reason: "Rate limited" },
        ],
      }),
    );

    await expect(capturedProcessor!(makeJob())).resolves.not.toThrow();
  });

  it("does NOT throw when some were skipped and some rate-limited (skipped > 0)", async () => {
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({
        sent: 0,
        skipped: 3,
        rateLimited: 2,
        errors: [
          { chargeId: "c1", memberId: "m1", reason: "Rate limited" },
          { chargeId: "c2", memberId: "m2", reason: "Rate limited" },
        ],
      }),
    );

    await expect(capturedProcessor!(makeJob())).resolves.not.toThrow();
  });

  it("re-throws errors from sendOverdueNoticesForClub (e.g. decryptField failure)", async () => {
    mockSendOverdueNoticesForClub.mockRejectedValueOnce(
      new Error("Encryption key not configured"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "Encryption key not configured",
    );
  });

  it("logs a warning when result.errors is non-empty", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({
        sent: 1,
        errors: [{ chargeId: "c1", memberId: "m1", reason: "WA failed" }],
      }),
    );

    await capturedProcessor!(makeJob());

    expect(warnSpy).toHaveBeenCalled();
    const warnMessage = warnSpy.mock.calls.flat().join(" ");
    expect(warnMessage).toContain("club-xyz");
    warnSpy.mockRestore();
  });

  it("does not warn when result.errors is empty", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({ errors: [] }),
    );

    await capturedProcessor!(makeJob());

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("uses different clubIds per job correctly", async () => {
    const job = makeJob({
      data: {
        clubId: "club-different",
        targetDateStart: "2025-06-01T00:00:00.000Z",
        targetDateEnd: "2025-06-01T23:59:59.999Z",
      },
    });
    mockSendOverdueNoticesForClub.mockResolvedValueOnce(
      makeOverdueResult({ clubId: "club-different" }),
    );

    await capturedProcessor!(job);

    expect(mockSendOverdueNoticesForClub).toHaveBeenCalledWith(
      {},
      "club-different",
      new Date("2025-06-01T00:00:00.000Z"),
      new Date("2025-06-01T23:59:59.999Z"),
    );
  });
});

describe("startOverdueNoticeWorker — failed event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startOverdueNoticeWorker();
  });

  it("failed handler is registered on the worker", () => {
    expect(capturedFailedHandler).not.toBeNull();
  });

  it("does not throw when job is undefined (safe guard)", () => {
    expect(() =>
      capturedFailedHandler!(undefined, new Error("orphan")),
    ).not.toThrow();
  });

  it("logs error info on failure with job details", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const job = makeJob({ attemptsMade: 1, opts: { attempts: 2 } });

    capturedFailedHandler!(job, new Error("DB connection lost"));

    expect(consoleSpy).toHaveBeenCalled();
    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("club-xyz");
    consoleSpy.mockRestore();
  });

  it("includes attemptsMade in error log", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const job = makeJob({ attemptsMade: 2, opts: { attempts: 2 } });

    capturedFailedHandler!(job, new Error("timeout"));

    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("2");
    consoleSpy.mockRestore();
  });
});

describe("startOverdueNoticeWorker — completed event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startOverdueNoticeWorker();
  });

  it("completed handler is registered on the worker", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("logs completion summary when result is defined", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();
    const result = makeOverdueResult({
      sent: 5,
      skipped: 2,
      emailFallbacks: 1,
    });

    capturedCompletedHandler!(job, result);

    expect(consoleSpy).toHaveBeenCalled();
    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("sent: 5");
    expect(logMessage).toContain("skipped: 2");
    expect(logMessage).toContain("emailFallbacks: 1");
    consoleSpy.mockRestore();
  });

  it("includes the club ID in the completion log", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, makeOverdueResult());

    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("club-xyz");
    consoleSpy.mockRestore();
  });

  it("does not throw when result is undefined", () => {
    const job = makeJob();
    expect(() => capturedCompletedHandler!(job, undefined)).not.toThrow();
  });
});

describe("startOverdueNoticeWorker — worker configuration", () => {
  it("registers a Worker on the overdue-notices queue with concurrency 5", async () => {
    vi.clearAllMocks();
    startOverdueNoticeWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "overdue-notices",
      expect.any(Function),
      expect.objectContaining({ concurrency: 5 }),
    );
  });
});
