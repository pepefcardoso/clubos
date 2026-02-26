import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { chargeGenerationQueue } from "../queues.js";
import {
  JOB_NAMES,
  type DispatchMonthlyChargesPayload,
  type GenerateClubChargesPayload,
} from "./charge-generation.types.js";

/**
 * Actor ID used in audit log entries created by cron-triggered runs.
 * Distinguishable from human-triggered runs (T-025 uses the authenticated user's ID).
 */
export const SYSTEM_ACTOR_ID = "system:cron";

/**
 * Returns a stable `YYYY-MM` key for the given billing period.
 *
 * Used to construct idempotent per-club job IDs. Two dispatch runs for the
 * same calendar month will produce identical job IDs, which BullMQ deduplicates
 * automatically — preventing double-billing even if the cron fires twice.
 *
 * @param billingPeriod - Optional ISO date string. Defaults to current UTC month.
 */
export function getBillingKey(billingPeriod?: string): string {
  const ref = billingPeriod ? new Date(billingPeriod) : new Date();
  const year = ref.getUTCFullYear();
  const month = String(ref.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Starts the charge dispatch worker.
 *
 * This worker processes `dispatch-monthly-charges` jobs (the cron trigger).
 * Its sole responsibility is to:
 *   1. Fetch all registered clubs from the public schema.
 *   2. Enqueue one `generate-club-charges` job per club with a stable jobId.
 *
 * The actual charge generation is handled by the generation worker (concurrency=5).
 * The dispatch worker runs with concurrency=1 because it is a single coordinator.
 *
 * Fan-out design rationale:
 *   A direct per-club loop inside the cron handler would make the entire run
 *   un-retryable as a unit and would block the event loop proportionally to the
 *   club count. By enqueuing separate jobs, each club gets independent retry
 *   semantics and the concurrency cap is enforced at the worker level.
 */
export function startChargeDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchMonthlyChargesPayload>(
    "charge-generation",
    async (job: Job<DispatchMonthlyChargesPayload>) => {
      if (job.name !== JOB_NAMES.DISPATCH_MONTHLY_CHARGES) return;

      const startedAt = new Date().toISOString();
      job.log(`[dispatch] Starting monthly charge dispatch — ${startedAt}`);

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(`[dispatch] Found ${clubs.length} clubs to process`);

      if (clubs.length === 0) {
        job.log("[dispatch] No clubs found — nothing to enqueue");
        return { dispatched: 0 };
      }

      const billingKey = getBillingKey(job.data.billingPeriod);

      const bulkJobs = clubs.map((club) => ({
        name: JOB_NAMES.GENERATE_CLUB_CHARGES,
        data: {
          clubId: club.id,
          actorId: SYSTEM_ACTOR_ID,
          ...(job.data.billingPeriod !== undefined && {
            billingPeriod: job.data.billingPeriod,
          }),
        } satisfies GenerateClubChargesPayload,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * If this dispatch runs twice for the same billing period
           * (e.g. after a crash and restart), BullMQ will not enqueue
           * a second copy of an already-queued job with the same ID.
           */
          jobId: `generate-${club.id}-${billingKey}`,
        },
      }));

      await chargeGenerationQueue.addBulk(bulkJobs);

      job.log(
        `[dispatch] Enqueued ${bulkJobs.length} club charge jobs for period ${billingKey}`,
      );

      return { dispatched: bulkJobs.length, billingKey };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[charge-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[charge-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
