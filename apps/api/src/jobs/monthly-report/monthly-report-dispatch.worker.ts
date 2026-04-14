import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { monthlyReportQueue } from "../queues.js";
import {
  MONTHLY_REPORT_JOB_NAMES,
  type DispatchMonthlyReportJobData,
  type GenerateClubMonthlyReportJobData,
} from "./monthly-report.types.js";
import { getPreviousMonthRange } from "./monthly-report.service.js";

/**
 * Starts the monthly financial report dispatch worker.
 *
 * Processes `dispatch-monthly-report` jobs (the cron trigger on the 2nd of
 * every month at 07:00 UTC). Responsibilities:
 *   1. Compute the previous calendar month's date range.
 *   2. Fetch all registered clubs from the public schema.
 *   3. Enqueue one `generate-club-monthly-report` job per club with a stable jobId.
 *
 * Fan-out design rationale — mirrors every other dispatch worker:
 *   Processing all clubs inline would make the entire cron run non-retryable
 *   as a unit and would block the event loop proportionally to club count.
 *   Separate jobs give each club independent retry semantics and BullMQ
 *   concurrency control.
 *
 * Stable jobId format: `monthly-report-{clubId}-{YYYY-MM}`
 *   e.g. `monthly-report-club123-2025-03`
 *   BullMQ deduplicates jobs by ID — safe to restart or re-fire without
 *   double-enqueuing.
 *
 * Date range computed once in the dispatch worker (not per-club) to ensure
 * all per-club jobs operate on an identical time reference, avoiding clock
 * skew between enqueue time and execution time.
 *
 * Concurrency = 1 — single coordinator job.
 */
export function startMonthlyReportDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchMonthlyReportJobData>(
    "monthly-report",
    async (job: Job<DispatchMonthlyReportJobData>) => {
      if (job.name !== MONTHLY_REPORT_JOB_NAMES.DISPATCH_MONTHLY_REPORT) return;

      const startedAt = new Date().toISOString();
      job.log(
        `[monthly-report-dispatch] Starting monthly report dispatch — ${startedAt}`,
      );

      const now = job.data.targetDate
        ? new Date(job.data.targetDate)
        : new Date();

      const { periodStart, periodEnd, reportPeriod } =
        getPreviousMonthRange(now);

      job.log(
        `[monthly-report-dispatch] Reporting period: ${reportPeriod} ` +
          `(${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)})`,
      );

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(
        `[monthly-report-dispatch] Found ${clubs.length} clubs to process`,
      );

      if (clubs.length === 0) {
        job.log(
          "[monthly-report-dispatch] No clubs found — nothing to enqueue",
        );
        return { dispatched: 0 };
      }

      const bulkJobs = clubs.map((club) => ({
        name: MONTHLY_REPORT_JOB_NAMES.GENERATE_CLUB_MONTHLY_REPORT,
        data: {
          clubId: club.id,
          reportPeriod,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        } satisfies GenerateClubMonthlyReportJobData,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * If the cron fires twice for the same month (e.g. after a crash),
           * BullMQ will not enqueue a second copy of an already-queued job.
           */
          jobId: `monthly-report-${club.id}-${reportPeriod}`,
        },
      }));

      await monthlyReportQueue.addBulk(bulkJobs);

      job.log(
        `[monthly-report-dispatch] Enqueued ${bulkJobs.length} report jobs for period ${reportPeriod}`,
      );

      return { dispatched: bulkJobs.length, targetDate: reportPeriod };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[monthly-report-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[monthly-report-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
