import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { contractAlertQueue } from "../queues.js";
import {
  CONTRACT_ALERT_JOB_NAMES,
  type DispatchContractAlertsJobData,
  type SendClubContractAlertsJobData,
} from "./contract-alert.types.js";
import { getTargetDayRange } from "../job-utils.js";

/**
 * Starts the contract alert dispatch worker.
 *
 * Processes `dispatch-contract-alerts` jobs (the daily cron trigger at 11:00 UTC).
 * Responsibilities:
 *   1. Compute both target date ranges (D+7 and D+1) from today's UTC date.
 *   2. Fetch all registered clubs from the public schema.
 *   3. Enqueue one `send-club-contract-alerts` job per club with a stable jobId.
 *
 * Fan-out design — mirrors billing-reminder-dispatch.worker.ts:
 *   Processing all clubs inline would make the entire cron run non-retryable as a
 *   unit and would block the event loop proportionally to club count. Separate jobs
 *   give each club independent retry semantics and BullMQ concurrency control.
 *
 * Stable jobId format: `contract-alert-{clubId}-{targetDateKey}`
 *   e.g. `contract-alert-clubABC-2025-03-08`
 *   BullMQ deduplicates by ID — safe to restart or re-fire without double-enqueue.
 *
 * Date windows computed once in the dispatch worker (not per-club) to ensure all
 * per-club jobs operate on an identical time reference, avoiding clock-skew between
 * enqueue time and execution time.
 *
 * Concurrency = 1 — single coordinator job.
 */
export function startContractAlertDispatchWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<DispatchContractAlertsJobData>(
    "contract-alerts",
    async (job: Job<DispatchContractAlertsJobData>) => {
      if (job.name !== CONTRACT_ALERT_JOB_NAMES.DISPATCH_CONTRACT_ALERTS)
        return;

      const startedAt = new Date().toISOString();
      job.log(
        `[contract-alert-dispatch] Starting daily contract alert dispatch — ${startedAt}`,
      );

      const now = job.data.targetDate
        ? new Date(job.data.targetDate)
        : new Date();

      const [d7DateStart, d7DateEnd] = getTargetDayRange(7, now);
      const [d1DateStart, d1DateEnd] = getTargetDayRange(1, now);

      const targetDateKey = d7DateStart.toISOString().slice(0, 10);

      job.log(
        `[contract-alert-dispatch] D-7 window: ${d7DateStart.toISOString().slice(0, 10)} | ` +
          `D-1 window: ${d1DateStart.toISOString().slice(0, 10)}`,
      );

      const clubs = await prisma.club.findMany({
        select: { id: true, name: true },
      });

      job.log(
        `[contract-alert-dispatch] Found ${clubs.length} clubs to process`,
      );

      if (clubs.length === 0) {
        job.log(
          "[contract-alert-dispatch] No clubs found — nothing to enqueue",
        );
        return { dispatched: 0 };
      }

      const bulkJobs = clubs.map((club) => ({
        name: CONTRACT_ALERT_JOB_NAMES.SEND_CLUB_CONTRACT_ALERTS,
        data: {
          clubId: club.id,
          d7DateStart: d7DateStart.toISOString(),
          d7DateEnd: d7DateEnd.toISOString(),
          d1DateStart: d1DateStart.toISOString(),
          d1DateEnd: d1DateEnd.toISOString(),
        } satisfies SendClubContractAlertsJobData,
        opts: {
          /**
           * Stable jobId = idempotency at queue level.
           * If the cron fires twice on the same day (e.g. after a crash),
           * BullMQ will not enqueue a second copy of an already-queued job.
           */
          jobId: `contract-alert-${club.id}-${targetDateKey}`,
        },
      }));

      await contractAlertQueue.addBulk(bulkJobs);

      job.log(
        `[contract-alert-dispatch] Enqueued ${bulkJobs.length} contract alert jobs for ${targetDateKey}`,
      );

      return { dispatched: bulkJobs.length, targetDate: targetDateKey };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[contract-alert-dispatch] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[contract-alert-dispatch] Job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
