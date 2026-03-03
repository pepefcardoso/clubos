import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { overdueNoticeQueue } from "../queues.js";
import {
  OVERDUE_NOTICE_JOB_NAMES,
  type DispatchOverdueNoticesJobData,
  type SendClubOverdueNoticesJobData,
} from "./overdue-notice.types.js";
import { getTargetDayRange } from "../job-utils.js";

/**
 * Starts the overdue notice dispatch worker.
 *
 * This worker processes `dispatch-overdue-notices` jobs (the daily cron trigger).
 * Its sole responsibility is to:
 *   1. Compute the target D-3 date range (3 days ago) from today's UTC date.
 *   2. Fetch all registered clubs from the public schema.
 *   3. Enqueue one `send-club-overdue-notices` job per club with a stable jobId.
 *
 * Fan-out design — identical to the billing-reminder dispatch pattern:
 *   A direct per-club loop inside the cron handler would make the entire run
 *   un-retryable as a unit and would block the event loop proportionally to the
 *   club count. By enqueuing separate jobs, each club gets independent retry
 *   semantics and the concurrency cap (5) is enforced at the worker level.
 *
 * Stable jobId format: `overdue-{clubId}-{targetDate}` (e.g. `overdue-clubABC-2025-03-01`)
 *   BullMQ deduplicates jobs by ID, so if the cron fires twice for the same day
 *   (e.g. after a crash and restart), no duplicate jobs are enqueued.
 *
 * Target date = today - 3 (look-back), computed via getTargetDayRange(-3, now).
 *
 * Concurrency = 1 because this is a single coordinator job.
 */
export function startOverdueNoticeDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchOverdueNoticesJobData>(
    "overdue-notices",
    async (job: Job<DispatchOverdueNoticesJobData>) => {
      if (job.name !== OVERDUE_NOTICE_JOB_NAMES.DISPATCH_OVERDUE_NOTICES)
        return;

      const startedAt = new Date().toISOString();
      job.log(
        `[overdue-dispatch] Starting daily D+3 overdue notice dispatch — ${startedAt}`,
      );

      const now = job.data.targetDate
        ? new Date(job.data.targetDate)
        : new Date();
      const [targetDateStart, targetDateEnd] = getTargetDayRange(-3, now);

      job.log(
        `[overdue-dispatch] Target day (3 days ago): ${targetDateStart.toISOString().slice(0, 10)}`,
      );

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(`[overdue-dispatch] Found ${clubs.length} clubs to process`);

      if (clubs.length === 0) {
        job.log("[overdue-dispatch] No clubs found — nothing to enqueue");
        return { dispatched: 0 };
      }

      const targetDateKey = targetDateStart.toISOString().slice(0, 10);

      const bulkJobs = clubs.map((club) => ({
        name: OVERDUE_NOTICE_JOB_NAMES.SEND_CLUB_OVERDUE_NOTICES,
        data: {
          clubId: club.id,
          targetDateStart: targetDateStart.toISOString(),
          targetDateEnd: targetDateEnd.toISOString(),
        } satisfies SendClubOverdueNoticesJobData,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * If this dispatch runs twice for the same day (e.g. after a crash),
           * BullMQ will not enqueue a second copy of an already-queued job.
           */
          jobId: `overdue-${club.id}-${targetDateKey}`,
        },
      }));

      await overdueNoticeQueue.addBulk(bulkJobs);

      job.log(
        `[overdue-dispatch] Enqueued ${bulkJobs.length} overdue notice jobs for target day ${targetDateKey}`,
      );

      return { dispatched: bulkJobs.length, targetDate: targetDateKey };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[overdue-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[overdue-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
