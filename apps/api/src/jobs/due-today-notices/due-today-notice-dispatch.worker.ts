import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { dueTodayNoticeQueue } from "../queues.js";
import {
  DUE_TODAY_NOTICE_JOB_NAMES,
  type DispatchDueTodayNoticesJobData,
  type SendClubDueTodayNoticesJobData,
} from "./due-today-notice.types.js";
import { getTargetDayRange } from "../job-utils.js";

/**
 * Starts the D-0 due-today notice dispatch worker.
 *
 * This worker processes `dispatch-due-today-notices` jobs (the cron trigger).
 * Its sole responsibility is to:
 *   1. Compute today's UTC date range using offsetDays=0.
 *   2. Fetch all registered clubs from the public schema.
 *   3. Enqueue one `send-club-due-today-notices` job per club with a stable jobId.
 *
 * Fan-out design rationale — identical to the D-3 billing-reminder pattern:
 *   A direct per-club loop inside the cron handler would make the entire run
 *   un-retryable as a unit and would block the event loop proportionally to the
 *   club count. By enqueuing separate jobs, each club gets independent retry
 *   semantics and the concurrency cap (5) is enforced at the worker level.
 *
 * Stable jobId format: `d0-{clubId}-{targetDate}` (e.g. `d0-clubABC-2025-03-13`)
 *   BullMQ deduplicates jobs by ID, so if the cron fires twice for the same day
 *   (e.g. after a crash and restart), no duplicate jobs are enqueued.
 *
 * Concurrency = 1 because this is a single coordinator job.
 */
export function startDueTodayNoticeDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchDueTodayNoticesJobData>(
    "due-today-notices",
    async (job: Job<DispatchDueTodayNoticesJobData>) => {
      if (job.name !== DUE_TODAY_NOTICE_JOB_NAMES.DISPATCH_DUE_TODAY_NOTICES)
        return;

      const startedAt = new Date().toISOString();
      job.log(
        `[d0-dispatch] Starting D-0 due-today notice dispatch — ${startedAt}`,
      );

      const now = job.data.targetDate
        ? new Date(job.data.targetDate)
        : new Date();
      const [targetDateStart, targetDateEnd] = getTargetDayRange(0, now);

      const targetDateKey = targetDateStart.toISOString().slice(0, 10);
      job.log(`[d0-dispatch] Target day: ${targetDateKey}`);

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(`[d0-dispatch] Found ${clubs.length} clubs to process`);

      if (clubs.length === 0) {
        job.log("[d0-dispatch] No clubs found — nothing to enqueue");
        return { dispatched: 0 };
      }

      const bulkJobs = clubs.map((club) => ({
        name: DUE_TODAY_NOTICE_JOB_NAMES.SEND_CLUB_DUE_TODAY_NOTICES,
        data: {
          clubId: club.id,
          targetDateStart: targetDateStart.toISOString(),
          targetDateEnd: targetDateEnd.toISOString(),
        } satisfies SendClubDueTodayNoticesJobData,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * If this dispatch runs twice for the same day (e.g. after a crash),
           * BullMQ will not enqueue a second copy of an already-queued job.
           */
          jobId: `d0-${club.id}-${targetDateKey}`,
        },
      }));

      await dueTodayNoticeQueue.addBulk(bulkJobs);

      job.log(
        `[d0-dispatch] Enqueued ${bulkJobs.length} due-today notice jobs for target day ${targetDateKey}`,
      );

      return { dispatched: bulkJobs.length, targetDate: targetDateKey };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[d0-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[d0-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
