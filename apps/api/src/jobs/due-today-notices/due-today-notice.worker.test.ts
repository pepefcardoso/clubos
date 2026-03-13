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

const mockSendDueTodayNoticesForClub = vi.fn();
vi.mock("./due-today-notice.service.js", () => ({
  sendDueTodayNoticesForClub: (...args: unknown[]) =>
    mockSendDueTodayNoticesForClub(...args),
}));

import { startDueTodayNoticeWorker } from "./due-today-notice.worker.js";
import { DUE_TODAY_NOTICE_JOB_NAMES } from "./due-today-notice.types.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-001",
    name: DUE_TODAY_NOTICE_JOB_NAMES.SEND_CLUB_DUE_TODAY_NOTICES,
    data: {
      clubId: "club-abc",
      targetDateStart: "2025-04-13T00:00:00.000Z",
      targetDateEnd: "2025-04-13T23:59:59.999Z",
    },
    attemptsMade: 1,
    opts: { attempts: 2 },
    log: vi.fn(),
    ...overrides,
  };
}

function makeNoticeResult(overrides = {}) {
  return {
    clubId: "club-abc",
    sent: 3,
    skipped: 1,
    rateLimited: 0,
    emailFallbacks: 0,
    errors: [],
    ...overrides,
  };
}

describe("startDueTodayNoticeWorker — processor function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startDueTodayNoticeWorker();
  });

  it("returns undefined for non-send-club-due-today-notices job names (guard clause)", async () => {
    const job = makeJob({ name: "dispatch-due-today-notices" });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockSendDueTodayNoticesForClub).not.toHaveBeenCalled();
  });

  it("calls sendDueTodayNoticesForClub with parsed Date objects from ISO strings", async () => {
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(makeNoticeResult());

    await capturedProcessor!(makeJob());

    expect(mockSendDueTodayNoticesForClub).toHaveBeenCalledWith(
      {},
      "club-abc",
      new Date("2025-04-13T00:00:00.000Z"),
      new Date("2025-04-13T23:59:59.999Z"),
    );
  });

  it("returns the result from sendDueTodayNoticesForClub on success", async () => {
    const expected = makeNoticeResult({ sent: 5, skipped: 2 });
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(expected);

    const result = await capturedProcessor!(makeJob());

    expect(result).toEqual(expected);
  });

  it("logs start and summary messages", async () => {
    const job = makeJob();
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(
      makeNoticeResult({ sent: 4, skipped: 1, emailFallbacks: 1 }),
    );

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(2);
    const firstCall = job.log.mock.calls.at(0)?.at(0) as string;
    const secondCall = job.log.mock.calls.at(1)?.at(0) as string;
    expect(firstCall).toContain("club-abc");
    expect(secondCall).toContain("sent: 4");
    expect(secondCall).toContain("skipped: 1");
    expect(secondCall).toContain("emailFallbacks: 1");
  });

  it("completes successfully when result.errors is non-empty (per-member failures are non-fatal)", async () => {
    const result = makeNoticeResult({
      sent: 2,
      errors: [{ chargeId: "c1", memberId: "m1", reason: "WA failed" }],
    });
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(result);

    const returnedResult = await capturedProcessor!(makeJob());
    expect(returnedResult).toEqual(result);
  });

  it("throws when ALL charges were rate-limited (sent=0, skipped=0, rateLimited>0)", async () => {
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(
      makeNoticeResult({
        sent: 0,
        skipped: 0,
        rateLimited: 3,
        errors: [
          { chargeId: "c1", memberId: "m1", reason: "Rate limited" },
          { chargeId: "c2", memberId: "m2", reason: "Rate limited" },
          { chargeId: "c3", memberId: "m3", reason: "Rate limited" },
        ],
      }),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      /Rate limited for club club-abc/,
    );
  });

  it("includes rateLimited count in the thrown error message", async () => {
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(
      makeNoticeResult({
        sent: 0,
        skipped: 0,
        rateLimited: 5,
        errors: Array.from({ length: 5 }, (_, i) => ({
          chargeId: `c${i}`,
          memberId: `m${i}`,
          reason: "Rate limited",
        })),
      }),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(/5 message/);
  });

  it("does NOT throw when some were sent despite some being rate-limited (partial batch)", async () => {
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(
      makeNoticeResult({
        sent: 2,
        skipped: 0,
        rateLimited: 1,
        errors: [{ chargeId: "c1", memberId: "m1", reason: "Rate limited" }],
      }),
    );

    await expect(capturedProcessor!(makeJob())).resolves.not.toThrow();
  });

  it("does NOT throw when some were skipped and some rate-limited (skipped > 0)", async () => {
    mockSendDueTodayNoticesForClub.mockResolvedValueOnce(
      makeNoticeResult({
        sent: 0,
        skipped: 2,
        rateLimited: 1,
        errors: [{ chargeId: "c1", memberId: "m1", reason: "Rate limited" }],
      }),
    );

    await expect(capturedProcessor!(makeJob())).resolves.not.toThrow();
  });

  it("re-throws errors from sendDueTodayNoticesForClub (e.g. decryptField failure)", async () => {
    mockSendDueTodayNoticesForClub.mockRejectedValueOnce(
      new Error("Decryption key missing"),
    );

    await expect(capturedProcessor!(makeJob())).rejects.toThrow(
      "Decryption key missing",
    );
  });
});

describe("startDueTodayNoticeWorker — failed event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startDueTodayNoticeWorker();
  });

  it("failed handler is registered on the worker", () => {
    expect(capturedFailedHandler).not.toBeNull();
  });

  it("does not throw when job is undefined (safe guard)", () => {
    expect(() =>
      capturedFailedHandler!(undefined, new Error("orphan")),
    ).not.toThrow();
  });

  it("logs the club and attempt info on failure", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const job = makeJob({ attemptsMade: 1, opts: { attempts: 2 } });

    capturedFailedHandler!(job, new Error("WA provider down"));

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("startDueTodayNoticeWorker — completed event handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    startDueTodayNoticeWorker();
  });

  it("completed handler is registered on the worker", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("logs completion summary when result is defined", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();
    const result = makeNoticeResult({ sent: 3, skipped: 1, emailFallbacks: 1 });

    capturedCompletedHandler!(job, result);

    expect(consoleSpy).toHaveBeenCalled();
    const logArgs = consoleSpy.mock.calls.at(0) as string[];
    const logMessage = logArgs.join(" ");
    expect(logMessage).toContain("sent: 3");
    expect(logMessage).toContain("skipped: 1");
    expect(logMessage).toContain("emailFallbacks: 1");
    consoleSpy.mockRestore();
  });

  it("does not throw when result is undefined", () => {
    const job = makeJob();
    expect(() => capturedCompletedHandler!(job, undefined)).not.toThrow();
  });
});

describe("startDueTodayNoticeWorker — worker configuration", () => {
  it("registers a Worker on the due-today-notices queue with concurrency 5", async () => {
    vi.clearAllMocks();
    startDueTodayNoticeWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "due-today-notices",
      expect.any(Function),
      expect.objectContaining({ concurrency: 5 }),
    );
  });
});
