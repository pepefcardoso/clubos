import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPrismaClient } from "../../lib/prisma.js";

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
  acwrRefreshQueue: {
    add: vi.fn(),
    addBulk: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  },
}));

interface MockJob {
  id: string;
  name: string;
  data: { triggeredAt?: string };
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

import {
  getAcwrWindowKey,
  startAcwrRefreshDispatchWorker,
} from "./acwr-refresh-dispatch.worker.js";
import { ACWR_REFRESH_JOB_NAMES } from "./acwr-refresh.types.js";
import { acwrRefreshQueue } from "../queues.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-dispatch-001",
    name: ACWR_REFRESH_JOB_NAMES.DISPATCH_ACWR_REFRESH,
    data: {},
    attemptsMade: 1,
    log: vi.fn(),
    ...overrides,
  };
}

describe("getAcwrWindowKey", () => {
  it("returns a string matching YYYY-MM-DD-wN format for current time", () => {
    const key = getAcwrWindowKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}-w[0-5]$/);
  });

  it("returns w0 for 00:00 UTC (slot 0: 00:00–03:59)", () => {
    expect(getAcwrWindowKey("2025-03-25T00:00:00.000Z")).toBe("2025-03-25-w0");
  });

  it("returns w0 for 03:59 UTC (still slot 0)", () => {
    expect(getAcwrWindowKey("2025-03-25T03:59:59.999Z")).toBe("2025-03-25-w0");
  });

  it("returns w1 for 04:00 UTC (slot 1: 04:00–07:59)", () => {
    expect(getAcwrWindowKey("2025-03-25T04:00:00.000Z")).toBe("2025-03-25-w1");
  });

  it("returns w2 for 08:00 UTC (slot 2: 08:00–11:59)", () => {
    expect(getAcwrWindowKey("2025-03-25T08:00:00.000Z")).toBe("2025-03-25-w2");
  });

  it("returns w2 for 09:30 UTC (mid slot 2)", () => {
    expect(getAcwrWindowKey("2025-03-25T09:30:00.000Z")).toBe("2025-03-25-w2");
  });

  it("returns w3 for 12:00 UTC (slot 3: 12:00–15:59)", () => {
    expect(getAcwrWindowKey("2025-03-25T12:00:00.000Z")).toBe("2025-03-25-w3");
  });

  it("returns w4 for 16:00 UTC (slot 4: 16:00–19:59)", () => {
    expect(getAcwrWindowKey("2025-03-25T16:00:00.000Z")).toBe("2025-03-25-w4");
  });

  it("returns w5 for 20:00 UTC (slot 5: 20:00–23:59)", () => {
    expect(getAcwrWindowKey("2025-03-25T20:00:00.000Z")).toBe("2025-03-25-w5");
  });

  it("returns w5 for 23:59 UTC (end of day, still slot 5)", () => {
    expect(getAcwrWindowKey("2025-03-25T23:59:59.999Z")).toBe("2025-03-25-w5");
  });

  it("two calls within the same 4-hour window return the same key", () => {
    const key1 = getAcwrWindowKey("2025-03-25T08:01:00.000Z");
    const key2 = getAcwrWindowKey("2025-03-25T11:59:00.000Z");
    expect(key1).toBe(key2);
    expect(key1).toBe("2025-03-25-w2");
  });

  it("two calls in adjacent windows return different keys", () => {
    const key1 = getAcwrWindowKey("2025-03-25T07:59:59.999Z");
    const key2 = getAcwrWindowKey("2025-03-25T08:00:00.000Z");
    expect(key1).not.toBe(key2);
    expect(key1).toBe("2025-03-25-w1");
    expect(key2).toBe("2025-03-25-w2");
  });

  it("includes the correct date in the key", () => {
    expect(getAcwrWindowKey("2025-11-30T20:00:00.000Z")).toBe("2025-11-30-w5");
  });
});

describe("startAcwrRefreshDispatchWorker — processor function", () => {
  const mockPrisma = {
    club: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;

    vi.mocked(getPrismaClient).mockReturnValue(
      mockPrisma as unknown as ReturnType<typeof getPrismaClient>,
    );

    startAcwrRefreshDispatchWorker();
  });

  it("returns undefined for non-dispatch job names (guard clause)", async () => {
    const job = makeJob({ name: ACWR_REFRESH_JOB_NAMES.REFRESH_CLUB_ACWR });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockPrisma.club.findMany).not.toHaveBeenCalled();
  });

  it("returns { dispatched: 0 } when no clubs are found", async () => {
    mockPrisma.club.findMany.mockResolvedValue([]);
    const result = await capturedProcessor!(makeJob());
    expect(result).toEqual({ dispatched: 0 });
    expect(vi.mocked(acwrRefreshQueue.addBulk)).not.toHaveBeenCalled();
  });

  it("enqueues one job per club", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-25T08:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(acwrRefreshQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall).toHaveLength(2);
  });

  it("job payload contains clubId and triggeredAt", async () => {
    const triggeredAt = "2025-03-25T08:00:00.000Z";
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(makeJob({ data: { triggeredAt } }));

    const bulkCall = vi.mocked(acwrRefreshQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.data).toMatchObject({
      clubId: "club-aaa",
      triggeredAt,
    });
  });

  it("jobId follows 'acwr-{clubId}-{windowKey}' format", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-25T08:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(acwrRefreshQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.opts?.jobId).toBe("acwr-club-aaa-2025-03-25-w2");
  });

  it("two clubs in the same window get different jobIds", async () => {
    const triggeredAt = "2025-03-25T08:00:00.000Z";
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    await capturedProcessor!(makeJob({ data: { triggeredAt } }));

    const bulkCall = vi.mocked(acwrRefreshQueue.addBulk).mock.calls[0]?.[0];
    const jobId1 = bulkCall?.[0]?.opts?.jobId;
    const jobId2 = bulkCall?.[1]?.opts?.jobId;
    expect(jobId1).not.toBe(jobId2);
    expect(jobId1).toBe("acwr-club-aaa-2025-03-25-w2");
    expect(jobId2).toBe("acwr-club-bbb-2025-03-25-w2");
  });

  it("same club in different windows gets different jobIds", () => {
    const windowKey1 = getAcwrWindowKey("2025-03-25T04:00:00.000Z");
    const windowKey2 = getAcwrWindowKey("2025-03-25T08:00:00.000Z");
    const jobId1 = `acwr-club-aaa-${windowKey1}`;
    const jobId2 = `acwr-club-aaa-${windowKey2}`;
    expect(jobId1).not.toBe(jobId2);
    expect(jobId1).toBe("acwr-club-aaa-2025-03-25-w1");
    expect(jobId2).toBe("acwr-club-aaa-2025-03-25-w2");
  });

  it("returns { dispatched: N, windowKey } on success", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    const result = await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-25T08:00:00.000Z" } }),
    );

    expect(result).toEqual({ dispatched: 2, windowKey: "2025-03-25-w2" });
  });

  it("uses current time when triggeredAt is not provided in job data", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);
    const job = makeJob({ data: {} });

    const result = await capturedProcessor!(job);

    expect(result).toMatchObject({ dispatched: 1 });
    expect(vi.mocked(acwrRefreshQueue.addBulk)).toHaveBeenCalledOnce();
  });

  it("uses the job name REFRESH_CLUB_ACWR for enqueued jobs", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-25T08:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(acwrRefreshQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.name).toBe(ACWR_REFRESH_JOB_NAMES.REFRESH_CLUB_ACWR);
  });

  it("logs start and completion messages", async () => {
    const job = makeJob({ data: { triggeredAt: "2025-03-25T08:00:00.000Z" } });
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(3);
    const logs = job.log.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(logs[0]).toContain("Starting ACWR refresh dispatch");
    expect(logs[1]).toContain("Found 1 clubs");
    expect(logs[2]).toContain("Enqueued 1");
  });
});

describe("startAcwrRefreshDispatchWorker — failed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    startAcwrRefreshDispatchWorker();
  });

  it("failed handler is registered", () => {
    expect(capturedFailedHandler).not.toBeNull();
  });

  it("does not throw when job is undefined", () => {
    expect(() =>
      capturedFailedHandler!(undefined, new Error("orphan error")),
    ).not.toThrow();
  });

  it("logs error details when a job fails", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const job = makeJob({ attemptsMade: 1 });

    capturedFailedHandler!(job, new Error("DB timeout"));

    expect(consoleSpy).toHaveBeenCalled();
    const logMessage = consoleSpy.mock.calls.flat().join(" ");
    expect(logMessage).toContain("job-dispatch-001");
    consoleSpy.mockRestore();
  });
});

describe("startAcwrRefreshDispatchWorker — completed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedCompletedHandler = null;
    startAcwrRefreshDispatchWorker();
  });

  it("completed handler is registered", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("logs completion info", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, {
      dispatched: 3,
      windowKey: "2025-03-25-w2",
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("startAcwrRefreshDispatchWorker — worker configuration", () => {
  it("registers a Worker on the acwr-refresh queue with concurrency 1", async () => {
    vi.clearAllMocks();
    startAcwrRefreshDispatchWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "acwr-refresh",
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
  });
});
