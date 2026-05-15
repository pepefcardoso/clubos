import { describe, it, expect, vi, beforeEach } from "vitest";
import { Queue } from "bullmq";
import { SCOUT_CURATION_REPORT_JOB_NAMES } from "./scout-curation-report.types.js";

vi.mock("../../lib/redis.js", () => ({ getRedisClient: vi.fn(() => ({})) }));
vi.mock("../../lib/prisma.js", () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
}));
vi.mock("../queues.js", () => ({
  scoutCurationReportQueue: mockQueue,
}));

const mockAddBulk = vi.fn().mockResolvedValue([]);
const mockQueue = { addBulk: mockAddBulk } as unknown as Queue;

const mockFindMany = vi.fn();
const mockPrisma = {
  scoutProfile: { findMany: mockFindMany },
};

async function runProcessor(
  data: Record<string, unknown>,
  jobName: string,
): Promise<unknown> {
  const { startScoutCurationReportDispatchWorker } =
    await import("./scout-curation-report-dispatch.worker.js");

  const WorkerMock = vi.mocked((await import("bullmq")).Worker);
  const [[, processor]] = WorkerMock.mock.calls as [
    [unknown, (job: unknown) => Promise<unknown>],
  ];

  startScoutCurationReportDispatchWorker();
  const job = {
    name: jobName,
    data,
    log: vi.fn(),
  };
  return processor(job);
}

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();
  return {
    ...actual,
    Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => ({
      on: vi.fn(),
      _processor: processor,
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAddBulk.mockResolvedValue([]);
});

describe("scout-curation-report-dispatch worker", () => {
  it("returns early when job name does not match", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await runProcessor({}, "some-other-job");
    expect(result).toBeUndefined();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns dispatched: 0 when no active scouts", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await runProcessor(
      {},
      SCOUT_CURATION_REPORT_JOB_NAMES.DISPATCH_SCOUT_CURATION_REPORT,
    );
    expect(result).toMatchObject({ dispatched: 0 });
    expect(mockAddBulk).not.toHaveBeenCalled();
  });

  it("enqueues one job per scout with correct jobId format", async () => {
    mockFindMany.mockResolvedValue([{ id: "scout-aaa" }, { id: "scout-bbb" }]);
    const result = (await runProcessor(
      { targetDate: "2025-03-01T00:00:00.000Z" },
      SCOUT_CURATION_REPORT_JOB_NAMES.DISPATCH_SCOUT_CURATION_REPORT,
    )) as { dispatched: number; yearMonth: string };

    expect(result.dispatched).toBe(2);
    expect(result.yearMonth).toBe("2025-03");

    const bulkArg = mockAddBulk.mock.calls[0]![0] as Array<{
      data: { scoutId: string; yearMonth: string };
      opts: { jobId: string };
    }>;
    expect(bulkArg[0]!.opts.jobId).toBe("scout-curation-scout-aaa-2025-03");
    expect(bulkArg[1]!.opts.jobId).toBe("scout-curation-scout-bbb-2025-03");

    for (const j of bulkArg) {
      expect(Object.keys(j.data)).toEqual(
        expect.arrayContaining(["scoutId", "yearMonth"]),
      );
      expect(j.data).not.toHaveProperty("email");
      expect(j.data).not.toHaveProperty("name");
    }
  });

  it("derives yearMonth from targetDate correctly at year boundary", async () => {
    mockFindMany.mockResolvedValue([{ id: "scout-aaa" }]);
    const result = (await runProcessor(
      { targetDate: "2025-01-01T00:00:00.000Z" },
      SCOUT_CURATION_REPORT_JOB_NAMES.DISPATCH_SCOUT_CURATION_REPORT,
    )) as { yearMonth: string };

    expect(result.yearMonth).toBe("2025-01");
  });
});
