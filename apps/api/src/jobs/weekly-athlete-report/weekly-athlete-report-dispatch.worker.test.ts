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
  weeklyAthleteReportQueue: {
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
  getWeekKey,
  startWeeklyAthleteReportDispatchWorker,
} from "./weekly-athlete-report-dispatch.worker.js";
import { WEEKLY_ATHLETE_REPORT_JOB_NAMES } from "./weekly-athlete-report.types.js";
import { weeklyAthleteReportQueue } from "../queues.js";

function makeJob(overrides: Partial<MockJob> = {}): MockJob {
  return {
    id: "job-weekly-dispatch-001",
    name: WEEKLY_ATHLETE_REPORT_JOB_NAMES.DISPATCH_WEEKLY_ATHLETE_REPORT,
    data: {},
    attemptsMade: 1,
    log: vi.fn(),
    ...overrides,
  };
}

describe("getWeekKey()", () => {
  it("returns a string matching YYYY-Www format for current time", () => {
    const key = getWeekKey();
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("returns W24 for 2025-06-09 (Monday, known ISO week 24)", () => {
    expect(getWeekKey("2025-06-09T08:00:00.000Z")).toBe("2025-W24");
  });

  it("returns W24 for 2025-06-15 (Sunday — same ISO week 24)", () => {
    expect(getWeekKey("2025-06-15T23:59:59.999Z")).toBe("2025-W24");
  });

  it("Monday and Sunday in the same week return the same key", () => {
    const monday = getWeekKey("2025-06-09T00:00:00.000Z");
    const sunday = getWeekKey("2025-06-15T23:59:59.999Z");
    expect(monday).toBe(sunday);
    expect(monday).toBe("2025-W24");
  });

  it("consecutive weeks return different keys", () => {
    const week24 = getWeekKey("2025-06-09T08:00:00.000Z");
    const week25 = getWeekKey("2025-06-16T08:00:00.000Z");
    expect(week24).not.toBe(week25);
    expect(week24).toBe("2025-W24");
    expect(week25).toBe("2025-W25");
  });

  it("handles year boundary — last week of 2024 (Dec 30 is W01 of 2025)", () => {
    expect(getWeekKey("2024-12-30T08:00:00.000Z")).toBe("2025-W01");
  });

  it("handles first week of a year — Jan 1 2024 is W01 of 2024", () => {
    expect(getWeekKey("2024-01-01T08:00:00.000Z")).toBe("2024-W01");
  });

  it("pads single-digit week numbers to two digits", () => {
    const key = getWeekKey("2025-01-06T08:00:00.000Z");
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
    const weekPart = key.split("-W")[1];
    expect(weekPart).toHaveLength(2);
  });

  it("two calls within the same Monday return the same key", () => {
    const k1 = getWeekKey("2025-03-10T00:00:00.000Z");
    const k2 = getWeekKey("2025-03-10T23:59:59.999Z");
    expect(k1).toBe(k2);
  });

  it("different weeks (W10 vs W11 of 2025) return different keys", () => {
    const k1 = getWeekKey("2025-03-10T08:00:00.000Z");
    const k2 = getWeekKey("2025-03-03T08:00:00.000Z");
    expect(k1).not.toBe(k2);
  });
});

describe("startWeeklyAthleteReportDispatchWorker — processor function", () => {
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

    startWeeklyAthleteReportDispatchWorker();
  });

  it("returns undefined for non-dispatch job names (guard clause)", async () => {
    const job = makeJob({
      name: WEEKLY_ATHLETE_REPORT_JOB_NAMES.SEND_CLUB_WEEKLY_REPORT,
    });
    const result = await capturedProcessor!(job);
    expect(result).toBeUndefined();
    expect(mockPrisma.club.findMany).not.toHaveBeenCalled();
  });

  it("returns { dispatched: 0 } when no clubs are found", async () => {
    mockPrisma.club.findMany.mockResolvedValue([]);
    const result = await capturedProcessor!(makeJob());
    expect(result).toEqual({ dispatched: 0 });
    expect(vi.mocked(weeklyAthleteReportQueue.addBulk)).not.toHaveBeenCalled();
  });

  it("enqueues one job per club", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-06-09T08:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(weeklyAthleteReportQueue.addBulk).mock
      .calls[0]?.[0];
    expect(bulkCall).toHaveLength(2);
  });

  it("job payload contains clubId, triggeredAt, and weekKey", async () => {
    const triggeredAt = "2025-06-09T08:00:00.000Z";
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(makeJob({ data: { triggeredAt } }));

    const bulkCall = vi.mocked(weeklyAthleteReportQueue.addBulk).mock
      .calls[0]?.[0];
    expect(bulkCall?.[0]?.data).toMatchObject({
      clubId: "club-aaa",
      triggeredAt,
      weekKey: "2025-W24",
    });
  });

  it("jobId follows 'weekly-report-{clubId}-{weekKey}' format", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-06-09T08:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(weeklyAthleteReportQueue.addBulk).mock
      .calls[0]?.[0];
    expect(bulkCall?.[0]?.opts?.jobId).toBe("weekly-report-club-aaa-2025-W24");
  });

  it("two clubs in the same week get different jobIds", async () => {
    const triggeredAt = "2025-06-09T08:00:00.000Z";
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    await capturedProcessor!(makeJob({ data: { triggeredAt } }));

    const bulkCall = vi.mocked(weeklyAthleteReportQueue.addBulk).mock
      .calls[0]?.[0];
    const jobId1 = bulkCall?.[0]?.opts?.jobId;
    const jobId2 = bulkCall?.[1]?.opts?.jobId;
    expect(jobId1).not.toBe(jobId2);
    expect(jobId1).toBe("weekly-report-club-aaa-2025-W24");
    expect(jobId2).toBe("weekly-report-club-bbb-2025-W24");
  });

  it("same club in different weeks gets different jobIds", () => {
    const weekKey1 = getWeekKey("2025-06-09T08:00:00.000Z");
    const weekKey2 = getWeekKey("2025-06-16T08:00:00.000Z");
    const jobId1 = `weekly-report-club-aaa-${weekKey1}`;
    const jobId2 = `weekly-report-club-aaa-${weekKey2}`;
    expect(jobId1).not.toBe(jobId2);
    expect(jobId1).toBe("weekly-report-club-aaa-2025-W24");
    expect(jobId2).toBe("weekly-report-club-aaa-2025-W25");
  });

  it("returns { dispatched: N, weekKey } on success", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
      { id: "club-bbb", name: "Club B" },
    ]);

    const result = await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-06-09T08:00:00.000Z" } }),
    );

    expect(result).toEqual({ dispatched: 2, weekKey: "2025-W24" });
  });

  it("uses current time when triggeredAt is not provided in job data", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    const result = await capturedProcessor!(makeJob({ data: {} }));

    expect(result).toMatchObject({ dispatched: 1 });
    expect(vi.mocked(weeklyAthleteReportQueue.addBulk)).toHaveBeenCalledOnce();
  });

  it("uses the job name SEND_CLUB_WEEKLY_REPORT for enqueued jobs", async () => {
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(
      makeJob({ data: { triggeredAt: "2025-06-09T08:00:00.000Z" } }),
    );

    const bulkCall = vi.mocked(weeklyAthleteReportQueue.addBulk).mock
      .calls[0]?.[0];
    expect(bulkCall?.[0]?.name).toBe(
      WEEKLY_ATHLETE_REPORT_JOB_NAMES.SEND_CLUB_WEEKLY_REPORT,
    );
  });

  it("logs start, week key, club count, and enqueue count", async () => {
    const job = makeJob({
      data: { triggeredAt: "2025-06-09T08:00:00.000Z" },
    });
    mockPrisma.club.findMany.mockResolvedValue([
      { id: "club-aaa", name: "Club A" },
    ]);

    await capturedProcessor!(job);

    expect(job.log).toHaveBeenCalledTimes(3);
    const logs = job.log.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(logs[0]).toContain("Starting weekly athlete report dispatch");
    expect(logs[0]).toContain("2025-W24");
    expect(logs[1]).toContain("Found 1 clubs");
    expect(logs[2]).toContain("Enqueued 1");
  });
});

describe("startWeeklyAthleteReportDispatchWorker — failed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedFailedHandler = null;
    startWeeklyAthleteReportDispatchWorker();
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
    expect(logMessage).toContain("job-weekly-dispatch-001");
    consoleSpy.mockRestore();
  });
});

describe("startWeeklyAthleteReportDispatchWorker — completed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCompletedHandler = null;
    startWeeklyAthleteReportDispatchWorker();
  });

  it("completed handler is registered", () => {
    expect(capturedCompletedHandler).not.toBeNull();
  });

  it("logs completion info", () => {
    const consoleSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const job = makeJob();

    capturedCompletedHandler!(job, { dispatched: 3, weekKey: "2025-W24" });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe("startWeeklyAthleteReportDispatchWorker — worker configuration", () => {
  it("registers a Worker on the weekly-athlete-report queue with concurrency 1", async () => {
    vi.clearAllMocks();
    startWeeklyAthleteReportDispatchWorker();

    const { Worker } = vi.mocked(await import("bullmq"));
    expect(Worker).toHaveBeenCalledWith(
      "weekly-athlete-report",
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
  });
});
