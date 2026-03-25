import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { acwrRefreshQueue } from "../queues.js";
import {
  ACWR_REFRESH_JOB_NAMES,
  type DispatchAcwrRefreshJobData,
  type RefreshClubAcwrJobData,
} from "./acwr-refresh.types.js";

/**
 * Returns a stable key for the 4-hour refresh window containing `now`.
 *
 * Slot 0 = 00:00–03:59 UTC
 * Slot 1 = 04:00–07:59 UTC
 * Slot 2 = 08:00–11:59 UTC
 * Slot 3 = 12:00–15:59 UTC
 * Slot 4 = 16:00–19:59 UTC
 * Slot 5 = 20:00–23:59 UTC
 *
 * Used to build stable per-club jobIds so BullMQ deduplicates jobs when the
 * cron fires more than once within the same 4-hour window (e.g. after a crash
 * and restart).
 *
 * @example getAcwrWindowKey('2025-03-25T09:30:00.000Z') → '2025-03-25-w2'
 */
export function getAcwrWindowKey(isoDate?: string): string {
  const ref = isoDate ? new Date(isoDate) : new Date();
  const date = ref.toISOString().slice(0, 10);
  const slot = Math.floor(ref.getUTCHours() / 4);
  return `${date}-w${slot}`;
}

/**
 * Starts the ACWR refresh dispatch worker.
 *
 * Processes `dispatch-acwr-refresh` jobs (the 4-hourly cron trigger).
 * Its sole responsibility is to:
 *   1. Fetch all registered clubs from the public schema.
 *   2. Enqueue one `refresh-club-acwr` job per club with a stable jobId.
 *
 * Fan-out design rationale — identical to the charge-generation dispatch pattern:
 *   A direct per-club loop inside the cron handler would make the entire run
 *   un-retryable as a unit. By enqueuing separate jobs, each club gets
 *   independent retry semantics and the concurrency cap (3) is enforced
 *   at the worker level.
 *
 * Stable jobId format: `acwr-{clubId}-{windowKey}` (e.g. `acwr-clubABC-2025-03-25-w2`)
 *   BullMQ deduplicates jobs by ID, so if the cron fires twice within the same
 *   4-hour window (e.g. after a crash and restart), no duplicate jobs are enqueued.
 *
 * Concurrency = 1 because this is a single coordinator job.
 */
export function startAcwrRefreshDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchAcwrRefreshJobData>(
    "acwr-refresh",
    async (job: Job<DispatchAcwrRefreshJobData>) => {
      if (job.name !== ACWR_REFRESH_JOB_NAMES.DISPATCH_ACWR_REFRESH) return;

      const triggeredAt = job.data.triggeredAt ?? new Date().toISOString();
      job.log(
        `[acwr-dispatch] Starting ACWR refresh dispatch — ${triggeredAt}`,
      );

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(`[acwr-dispatch] Found ${clubs.length} clubs to refresh`);

      if (clubs.length === 0) {
        job.log("[acwr-dispatch] No clubs found — nothing to enqueue");
        return { dispatched: 0 };
      }

      const windowKey = getAcwrWindowKey(triggeredAt);

      const bulkJobs = clubs.map((club) => ({
        name: ACWR_REFRESH_JOB_NAMES.REFRESH_CLUB_ACWR,
        data: {
          clubId: club.id,
          triggeredAt,
        } satisfies RefreshClubAcwrJobData,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * Two dispatches within the same 4-hour window produce the same
           * jobId — BullMQ will not enqueue a second copy of an already-queued
           * job with the same ID.
           */
          jobId: `acwr-${club.id}-${windowKey}`,
        },
      }));

      await acwrRefreshQueue.addBulk(bulkJobs);

      job.log(
        `[acwr-dispatch] Enqueued ${bulkJobs.length} ACWR refresh job(s) for window ${windowKey}`,
      );

      return { dispatched: bulkJobs.length, windowKey };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[acwr-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[acwr-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
