import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { scoutCurationReportQueue } from "../queues.js";
import {
  SCOUT_CURATION_REPORT_JOB_NAMES,
  type DispatchCurationReportJobData,
  type GenerateScoutCurationReportJobData,
} from "./scout-curation-report.types.js";

/**
 * Starts the monthly scout curation report dispatch worker.
 *
 * Processes `dispatch-scout-curation-report` jobs (the cron trigger on the
 * 1st of every month at 06:00 UTC). Responsibilities:
 *   1. Compute the current yearMonth from targetDate or new Date().
 *   2. Fetch all ACTIVE scouts with non-expired subscriptions.
 *   3. Enqueue one `generate-scout-curation-report` job per scout with a
 *      stable jobId for BullMQ-level deduplication.
 *
 * Stable jobId format: `scout-curation-{scoutId}-{YYYY-MM}`
 *   BullMQ deduplicates by ID — safe to re-fire without double-enqueuing.
 *
 * Subscription filter applied at dispatch time for efficiency (avoids
 * enqueuing jobs for inactive scouts), then re-verified per-scout inside
 * the worker to guard against lapse during queue processing.
 *
 * Concurrency = 1 — single coordinator job.
 */
export function startScoutCurationReportDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchCurationReportJobData>(
    "scout-curation-report",
    async (job: Job<DispatchCurationReportJobData>) => {
      if (
        job.name !==
        SCOUT_CURATION_REPORT_JOB_NAMES.DISPATCH_SCOUT_CURATION_REPORT
      ) {
        return;
      }

      const startedAt = new Date().toISOString();
      job.log(`[scout-curation-dispatch] Starting dispatch — ${startedAt}`);

      const now = job.data.targetDate
        ? new Date(job.data.targetDate)
        : new Date();

      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const yearMonth = `${year}-${month}`;

      job.log(`[scout-curation-dispatch] Reporting period: ${yearMonth}`);

      const scouts = await prisma.scoutProfile.findMany({
        where: {
          subscriptionStatus: "ACTIVE",
          subscriptionExpiresAt: { gt: now },
        },
        select: { id: true },
      });

      job.log(`[scout-curation-dispatch] Found ${scouts.length} active scouts`);

      if (scouts.length === 0) {
        job.log(
          "[scout-curation-dispatch] No active scouts — nothing to enqueue",
        );
        return { dispatched: 0, yearMonth };
      }

      const bulkJobs = scouts.map((scout) => ({
        name: SCOUT_CURATION_REPORT_JOB_NAMES.GENERATE_SCOUT_CURATION_REPORT,
        data: {
          scoutId: scout.id,
          yearMonth,
        } satisfies GenerateScoutCurationReportJobData,
        opts: {
          jobId: `scout-curation-${scout.id}-${yearMonth}`,
        },
      }));

      await scoutCurationReportQueue.addBulk(bulkJobs);

      job.log(
        `[scout-curation-dispatch] Enqueued ${bulkJobs.length} jobs for ${yearMonth}`,
      );

      return { dispatched: bulkJobs.length, yearMonth };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[scout-curation-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[scout-curation-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
