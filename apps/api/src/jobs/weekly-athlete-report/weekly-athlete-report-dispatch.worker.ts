import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { weeklyAthleteReportQueue } from "../queues.js";
import {
  WEEKLY_ATHLETE_REPORT_JOB_NAMES,
  type DispatchWeeklyAthleteReportJobData,
  type SendClubWeeklyReportJobData,
} from "./weekly-athlete-report.types.js";

/**
 * Returns a stable ISO-week key for the given date.
 * Format: "YYYY-Www"  e.g. "2025-W24"
 *
 * Uses ISO 8601 week numbering (Monday = start of week).
 * Two dispatch runs in the same calendar week produce the same key →
 * BullMQ deduplicates via stable jobId.
 *
 * @example getWeekKey("2025-06-09T08:00:00.000Z") → "2025-W24"
 */
export function getWeekKey(isoDate?: string): string {
  const ref = isoDate ? new Date(isoDate) : new Date();
  // ISO week: Thursday of the week determines the year
  const thursday = new Date(ref);
  thursday.setUTCDate(ref.getUTCDate() - ((ref.getUTCDay() + 6) % 7) + 3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekNum = Math.ceil(
    ((thursday.getTime() - jan4.getTime()) / 86_400_000 +
      ((jan4.getUTCDay() + 6) % 7) +
      1) /
      7,
  );
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Starts the weekly athlete report dispatch worker.
 *
 * Processes `dispatch-weekly-athlete-report` jobs (the Monday 08:00 UTC cron trigger).
 * Its sole responsibility is to:
 *   1. Fetch all registered clubs from the public schema.
 *   2. Enqueue one `send-club-weekly-report` job per club with a stable jobId.
 *
 * Fan-out design rationale — identical to the ACWR refresh dispatch pattern:
 *   A direct per-club loop inside the cron handler would make the entire run
 *   un-retryable as a unit. By enqueuing separate jobs, each club gets
 *   independent retry semantics and the concurrency cap (3) is enforced
 *   at the worker level.
 *
 * Stable jobId format: `weekly-report-{clubId}-{weekKey}` (e.g. `weekly-report-clubABC-2025-W24`)
 *   BullMQ deduplicates jobs by ID, so if the cron fires twice within the same
 *   calendar week (e.g. after a crash and restart), no duplicate jobs are enqueued.
 *
 * Concurrency = 1 because this is a single coordinator job.
 */
export function startWeeklyAthleteReportDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchWeeklyAthleteReportJobData>(
    "weekly-athlete-report",
    async (job: Job<DispatchWeeklyAthleteReportJobData>) => {
      if (
        job.name !==
        WEEKLY_ATHLETE_REPORT_JOB_NAMES.DISPATCH_WEEKLY_ATHLETE_REPORT
      )
        return;

      const triggeredAt = job.data.triggeredAt ?? new Date().toISOString();
      const weekKey = getWeekKey(triggeredAt);

      job.log(
        `[weekly-report-dispatch] Starting weekly athlete report dispatch — ` +
          `triggered: ${triggeredAt}, week: ${weekKey}`,
      );

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(
        `[weekly-report-dispatch] Found ${clubs.length} clubs to process`,
      );

      if (clubs.length === 0) {
        job.log("[weekly-report-dispatch] No clubs found — nothing to enqueue");
        return { dispatched: 0 };
      }

      const bulkJobs = clubs.map((club) => ({
        name: WEEKLY_ATHLETE_REPORT_JOB_NAMES.SEND_CLUB_WEEKLY_REPORT,
        data: {
          clubId: club.id,
          triggeredAt,
          weekKey,
        } satisfies SendClubWeeklyReportJobData,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * Two dispatches within the same ISO week produce the same
           * jobId — BullMQ will not enqueue a second copy.
           */
          jobId: `weekly-report-${club.id}-${weekKey}`,
        },
      }));

      await weeklyAthleteReportQueue.addBulk(bulkJobs);

      job.log(
        `[weekly-report-dispatch] Enqueued ${bulkJobs.length} weekly report job(s) ` +
          `for week ${weekKey}`,
      );

      return { dispatched: bulkJobs.length, weekKey };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[weekly-report-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[weekly-report-dispatch] Job ${job?.id} failed after ` +
        `${job?.attemptsMade} attempt(s): ${err.message}`,
    );
  });

  return worker;
}
