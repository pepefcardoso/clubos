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
  lgpdPurgeQueue: {
    add: vi.fn(),
    addBulk: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  },
}));

interface MockJob {
  id: string;
  name: string;
  data: { triggeredAt?: string; retentionMonths?: number };
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

import { startLgpdPurgeDispatchWorker } from "./lgpd-purge-dispatch.worker.js";
import { LGPD_PURGE_JOB_NAMES } from "./lgpd-purge.types.js";
import { lgpdPurgeQueue } from "../queues.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-lgpd-dispatch-001",
    name: LGPD_PURGE_JOB_NAMES.DISPATCH_LGPD_PURGE,
    data: {},
    attemptsMade: 1,
    log: vi.fn(),
    ...overrides,
  };
}

describe("startLgpdPurgeDispatchWorker — processor function", () => {
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

    startLgpdPurgeDispatchWorker();
  });

  it("returns undefined for non-dispatch job names (guard clause)", async () => {
    const job = makeJob({ name: LGPD_PURGE_JOB_NAMES.PURGE_CLUB_CONSENT });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockPrisma.club.findMany).not.toHaveBeenCalled();
  });

  it("returns { dispatched: 0 } when no clubs are found", async () => {
    mockPrisma.club.findMany.mockResolvedValue([]);
    const result = await capturedProcessor!(makeJob());
    expect(result).toEqual({ dispatched: 0 });
    expect(vi.mocked(lgpdPurgeQueue.addBulk)).not.toHaveBeenCalled();
  });

  it("enqueues one job per club", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-01T03:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall).toHaveLength(2);
  });

  it("job payload contains clubId, triggeredAt, and purgeBeforeIso", async () => {
    const triggeredAt = "2025-03-01T03:00:00.000Z";
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(makeJob({ data: { triggeredAt } }));

    const bulkCall = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.data).toMatchObject({
      clubId: "club-aaa",
      triggeredAt,
    });
    expect(bulkCall?.[0]?.data.purgeBeforeIso).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });

  it("jobId follows 'lgpd-{clubId}-{YYYY-MM-DD}' format", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-01T03:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.opts?.jobId).toBe("lgpd-club-aaa-2023-03-01");
  });

  it("two clubs get different jobIds", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-01T03:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    const jobId1 = bulkCall?.[0]?.opts?.jobId;
    const jobId2 = bulkCall?.[1]?.opts?.jobId;
    expect(jobId1).not.toBe(jobId2);
    expect(jobId1).toBe("lgpd-club-aaa-2023-03-01");
    expect(jobId2).toBe("lgpd-club-bbb-2023-03-01");
  });

  it("same club in different months gets different jobIds", async () => {
    const job1 = makeJob({ data: { triggeredAt: "2025-03-01T03:00:00.000Z" } });
    const job2 = makeJob({ data: { triggeredAt: "2025-04-01T03:00:00.000Z" } });

    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(job1);
    const bulkCall1 = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    const jobId1 = bulkCall1?.[0]?.opts?.jobId;

    vi.mocked(lgpdPurgeQueue.addBulk).mockClear();

    await capturedProcessor!(job2);
    const bulkCall2 = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    const jobId2 = bulkCall2?.[0]?.opts?.jobId;

    expect(jobId1).toBe("lgpd-club-aaa-2023-03-01");
    expect(jobId2).toBe("lgpd-club-aaa-2023-04-01");
    expect(jobId1).not.toBe(jobId2);
  });

  it("computes purgeBeforeIso using default 24 months when retentionMonths absent", async () => {
    const triggeredAt = "2025-06-15T03:00:00.000Z";
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(makeJob({ data: { triggeredAt } }));

    const bulkCall = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.data.purgeBeforeIso).toContain("2023-06-15");
  });

  it("respects custom retentionMonths from job data", async () => {
    const triggeredAt = "2025-06-15T03:00:00.000Z";
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt, retentionMonths: 12 } }),
    );

    const bulkCall = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.data.purgeBeforeIso).toContain("2024-06-15");
  });

  it("uses current time when triggeredAt is not provided in job data", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    const result = await capturedProcessor!(makeJob({ data: {} }));

    expect(result).toMatchObject({ dispatched: 1 });
    expect(vi.mocked(lgpdPurgeQueue.addBulk)).toHaveBeenCalledOnce();
  });

  it("uses the job name PURGE_CLUB_CONSENT for enqueued jobs", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-01T03:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(lgpdPurgeQueue.addBulk).mock.calls[0]?.[0];
    expect(bulkCall?.[0]?.name).toBe(LGPD_PURGE_JOB_NAMES.PURGE_CLUB_CONSENT);
  });

  it("returns { dispatched: N, purgeBeforeIso } on success", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    const result = await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-03-01T03:00:00.000Z" } }),
    );

    expect(result).toMatchObject({
      dispatched: 2,
      purgeBeforeIso: expect.stringContaining("2023-03-01"),
    });
  });

  it("logs start, club count, and enqueue count", async () => {
    const job = makeJob({ data: { triggeredAt: "2025-03-01T03:00:00.000Z" } });
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(4);
    const logs = job.log.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(logs[0]).toContain("Starting LGPD purge dispatch");
    expect(logs[0]).toContain("24 months");
    expect(logs[1]).toContain("Purge cutoff");
    expect(logs[2]).toContain("Found 1 clubs");
    expect(logs[3]).toContain("Enqueued 1");
  });
});

describe("startLgpdPurgeDispatchWorker — failed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    startLgpdPurgeDispatchWorker();
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
    expect(logMessage).toContain("job-lgpd-dispatch-001");
    consoleSpy.mockRestore();
  });
});

describe("startLgpdPurgeDispatchWorker — completed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCompletedHandler = null;
    startLgpdPurgeDispatchWorker();
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
      purgeBeforeIso: "2023-03-01T00:00:00.000Z",
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("startLgpdPurgeDispatchWorker — worker configuration", () => {
  it("registers a Worker on the lgpd-purge queue with concurrency 1", async () => {
    vi.clearAllMocks();
    startLgpdPurgeDispatchWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "lgpd-purge",
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
  });
});
