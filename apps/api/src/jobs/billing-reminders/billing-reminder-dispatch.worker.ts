import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { billingReminderQueue } from "../queues.js";
import {
  BILLING_REMINDER_JOB_NAMES,
  type DispatchDailyRemindersJobData,
  type SendClubRemindersJobData,
} from "./billing-reminder.types.js";
import { getTargetDayRange } from "./billing-reminder.service.js";

/**
 * Starts the billing reminder dispatch worker.
 *
 * This worker processes `dispatch-daily-reminders` jobs (the cron trigger).
 * Its sole responsibility is to:
 *   1. Compute the target D+3 date range from today's UTC date.
 *   2. Fetch all registered clubs from the public schema.
 *   3. Enqueue one `send-club-reminders` job per club with a stable jobId.
 *
 * Fan-out design rationale — identical to the charge generation pattern:
 *   A direct per-club loop inside the cron handler would make the entire run
 *   un-retryable as a unit and would block the event loop proportionally to the
 *   club count. By enqueuing separate jobs, each club gets independent retry
 *   semantics and the concurrency cap (5) is enforced at the worker level.
 *
 * Stable jobId format: `d3-{clubId}-{targetDate}` (e.g. `d3-clubABC-2025-03-04`)
 *   BullMQ deduplicates jobs by ID, so if the cron fires twice for the same day
 *   (e.g. after a crash and restart), no duplicate jobs are enqueued.
 *
 * Concurrency = 1 because this is a single coordinator job.
 */
export function startBillingReminderDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchDailyRemindersJobData>(
    "billing-reminders",
    async (job: Job<DispatchDailyRemindersJobData>) => {
      if (job.name !== BILLING_REMINDER_JOB_NAMES.DISPATCH_DAILY_REMINDERS)
        return;

      const startedAt = new Date().toISOString();
      job.log(
        `[d3-dispatch] Starting daily D-3 reminder dispatch — ${startedAt}`,
      );

      const now = job.data.targetDate
        ? new Date(job.data.targetDate)
        : new Date();
      const [targetDateStart, targetDateEnd] = getTargetDayRange(3, now);

      job.log(
        `[d3-dispatch] Target day: ${targetDateStart.toISOString().slice(0, 10)}`,
      );

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(`[d3-dispatch] Found ${clubs.length} clubs to process`);

      if (clubs.length === 0) {
        job.log("[d3-dispatch] No clubs found — nothing to enqueue");
        return { dispatched: 0 };
      }

      const targetDateKey = targetDateStart.toISOString().slice(0, 10);

      const bulkJobs = clubs.map((club) => ({
        name: BILLING_REMINDER_JOB_NAMES.SEND_CLUB_REMINDERS,
        data: {
          clubId: club.id,
          targetDateStart: targetDateStart.toISOString(),
          targetDateEnd: targetDateEnd.toISOString(),
        } satisfies SendClubRemindersJobData,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * If this dispatch runs twice for the same day (e.g. after a crash),
           * BullMQ will not enqueue a second copy of an already-queued job.
           */
          jobId: `d3-${club.id}-${targetDateKey}`,
        },
      }));

      await billingReminderQueue.addBulk(bulkJobs);

      job.log(
        `[d3-dispatch] Enqueued ${bulkJobs.length} reminder jobs for target day ${targetDateKey}`,
      );

      return { dispatched: bulkJobs.length, targetDate: targetDateKey };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[d3-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[d3-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
