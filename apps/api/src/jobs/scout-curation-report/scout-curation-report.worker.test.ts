import { describe, it, expect, vi, beforeEach } from "vitest";
import { SCOUT_CURATION_REPORT_JOB_NAMES } from "./scout-curation-report.types.js";
import * as service from "./scout-curation-report.service.js";

vi.mock("../../lib/redis.js", () => ({ getRedisClient: vi.fn(() => ({})) }));
vi.mock("../../lib/prisma.js", () => ({
  getPrismaClient: vi.fn(() => ({})),
}));

const mockGenerateAndSend = vi.spyOn(service, "generateAndSendCurationReport");

vi.mock("bullmq", async (importOriginal) => {
  const actual = await importOriginal<typeof import("bullmq")>();
  return {
    ...actual,
    Worker: vi
      .fn()
      .mockImplementation(
        (_name: string, processor: unknown, opts: unknown) => ({
          on: vi.fn(),
          _processor: processor,
          _opts: opts,
        }),
      ),
  };
});

async function runProcessor(
  data: Record<string, unknown>,
  jobName: string,
): Promise<unknown> {
  const { startScoutCurationReportWorker } =
    await import("./scout-curation-report.worker.js");
  const WorkerMock = vi.mocked((await import("bullmq")).Worker);
  const [[, processor]] = WorkerMock.mock.calls as [
    [unknown, (job: unknown) => Promise<unknown>, unknown],
  ];
  startScoutCurationReportWorker();
  const job = { name: jobName, data, log: vi.fn(), attemptsMade: 1 };
  return processor(job);
}

beforeEach(() => vi.clearAllMocks());

describe("scout-curation-report worker", () => {
  it("returns undefined when job name does not match", async () => {
    const result = await runProcessor({}, "wrong-job");
    expect(result).toBeUndefined();
    expect(mockGenerateAndSend).not.toHaveBeenCalled();
  });

  it("calls service with scoutId and yearMonth", async () => {
    mockGenerateAndSend.mockResolvedValue({
      scoutId: "scout-1",
      yearMonth: "2025-03",
      athleteCount: 5,
      emailSent: true,
      skipped: false,
    });

    const result = (await runProcessor(
      { scoutId: "scout-1", yearMonth: "2025-03" },
      SCOUT_CURATION_REPORT_JOB_NAMES.GENERATE_SCOUT_CURATION_REPORT,
    )) as service.CurationReportResult;

    expect(mockGenerateAndSend).toHaveBeenCalledWith(
      expect.anything(),
      "scout-1",
      "2025-03",
    );
    expect(result.emailSent).toBe(true);
    expect(result.athleteCount).toBe(5);
  });

  it("completes (does not throw) when service returns skipped result", async () => {
    mockGenerateAndSend.mockResolvedValue({
      scoutId: "scout-1",
      yearMonth: "2025-03",
      athleteCount: 0,
      emailSent: false,
      skipped: true,
      skipReason: "subscription lapsed",
    });

    await expect(
      runProcessor(
        { scoutId: "scout-1", yearMonth: "2025-03" },
        SCOUT_CURATION_REPORT_JOB_NAMES.GENERATE_SCOUT_CURATION_REPORT,
      ),
    ).resolves.toMatchObject({ skipped: true });
  });

  it("propagates thrown errors for BullMQ retry", async () => {
    mockGenerateAndSend.mockRejectedValue(new Error("PDFKit internal error"));

    await expect(
      runProcessor(
        { scoutId: "scout-1", yearMonth: "2025-03" },
        SCOUT_CURATION_REPORT_JOB_NAMES.GENERATE_SCOUT_CURATION_REPORT,
      ),
    ).rejects.toThrow("PDFKit internal error");
  });

  it("is registered with concurrency: 3", async () => {
    const { startScoutCurationReportWorker } =
      await import("./scout-curation-report.worker.js");
    const WorkerMock = vi.mocked((await import("bullmq")).Worker);
    startScoutCurationReportWorker();
    const lastCall = WorkerMock.mock.calls.at(-1)!;
    expect((lastCall[2] as { concurrency: number }).concurrency).toBe(3);
  });
});
