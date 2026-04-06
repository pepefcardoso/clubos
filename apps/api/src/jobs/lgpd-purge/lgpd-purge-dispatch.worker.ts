import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { lgpdPurgeQueue } from "../queues.js";
import {
  LGPD_PURGE_JOB_NAMES,
  type DispatchLgpdPurgeJobData,
  type PurgeClubConsentJobData,
} from "./lgpd-purge.types.js";
import { computePurgeCutoff } from "./lgpd-purge.service.js";

const DEFAULT_RETENTION_MONTHS = 24;

/**
 * Starts the LGPD purge dispatch worker.
 *
 * Processes `dispatch-lgpd-purge` jobs (the monthly cron trigger).
 * Its sole responsibility is to:
 *   1. Compute the cutoff date (now - retentionMonths) once for the entire run.
 *   2. Fetch all registered clubs from the public schema.
 *   3. Enqueue one `purge-club-consent` job per club with a stable jobId.
 *
 * Fan-out design rationale — identical to all other dispatch workers:
 *   A direct per-club loop inside the cron handler would make the entire run
 *   un-retryable as a unit. By enqueuing separate jobs, each club gets
 *   independent retry semantics and the concurrency cap (3) is enforced
 *   at the worker level.
 *
 * Stable jobId format: `lgpd-{clubId}-{cutoffDate}`
 *   The date component uses the cutoff date (not today's date). If the cron
 *   fires twice in the same month, both runs compute the same cutoff and
 *   therefore the same jobId — BullMQ deduplicates automatically.
 *
 * The purgeBeforeIso is computed once in dispatch and forwarded to all
 * per-club jobs. This ensures all clubs in a run use exactly the same
 * cutoff timestamp regardless of when each job actually executes.
 *
 * Concurrency = 1 because this is a single coordinator job.
 */
export function startLgpdPurgeDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchLgpdPurgeJobData>(
    "lgpd-purge",
    async (job: Job<DispatchLgpdPurgeJobData>) => {
      if (job.name !== LGPD_PURGE_JOB_NAMES.DISPATCH_LGPD_PURGE) return;

      const triggeredAt = job.data.triggeredAt ?? new Date().toISOString();
      const retentionMonths =
        job.data.retentionMonths ?? DEFAULT_RETENTION_MONTHS;

      job.log(
        `[lgpd-dispatch] Starting LGPD purge dispatch — triggered: ${triggeredAt}, ` +
          `retention: ${retentionMonths} months`,
      );

      const purgeBefore = computePurgeCutoff(
        retentionMonths,
        new Date(triggeredAt),
      );
      const purgeBeforeIso = purgeBefore.toISOString();

      job.log(
        `[lgpd-dispatch] Purge cutoff: ${purgeBeforeIso} ` +
          `(records older than this will be hard-deleted)`,
      );

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(`[lgpd-dispatch] Found ${clubs.length} clubs to process`);

      if (clubs.length === 0) {
        return { dispatched: 0 };
      }

      const dateKey = purgeBeforeIso.slice(0, 10);

      const bulkJobs = clubs.map((club) => ({
        name: LGPD_PURGE_JOB_NAMES.PURGE_CLUB_CONSENT,
        data: {
          clubId: club.id,
          triggeredAt,
          purgeBeforeIso,
        } satisfies PurgeClubConsentJobData,
        opts: {
          jobId: `lgpd-${club.id}-${dateKey}`,
        },
      }));

      await lgpdPurgeQueue.addBulk(bulkJobs);

      job.log(
        `[lgpd-dispatch] Enqueued ${bulkJobs.length} purge job(s), ` +
          `cutoff: ${dateKey}`,
      );

      return {
        dispatched: bulkJobs.length,
        purgeBeforeIso,
      };
    },
    { connection, concurrency: 1 },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[lgpd-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[lgpd-dispatch] Job ${job?.id} failed after ` +
        `${job?.attemptsMade} attempt(s): ${err.message}`,
    );
  });

  return worker;
}
