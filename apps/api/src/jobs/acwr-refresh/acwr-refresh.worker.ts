import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { refreshAcwrAggregates } from "../../modules/workload/acwr-refresh.service.js";
import {
  ACWR_REFRESH_JOB_NAMES,
  type RefreshClubAcwrJobData,
} from "./acwr-refresh.types.js";
import type { RefreshAcwrResult } from "../../modules/workload/acwr-refresh.service.js";

/**
 * Starts the per-club ACWR aggregate refresh worker.
 *
 * Processes `refresh-club-acwr` jobs — one per club per 4-hour window.
 * Calls `refreshAcwrAggregates()` which handles:
 *   - Probing the view row count inside withTenantSchema (transaction)
 *   - Running REFRESH MATERIALIZED VIEW [CONCURRENTLY] outside the transaction
 *     (PostgreSQL constraint: CONCURRENT refresh cannot run inside a tx block)
 *   - Returning { clubId, refreshedAt, concurrent, durationMs }
 *
 * Concurrency is set to 3 — lower than financial jobs (5) because
 * `REFRESH MATERIALIZED VIEW` is a full-scan DB operation that holds an
 * exclusive lock on the view during the non-concurrent (first-run) path.
 * Running 3 simultaneously is safe for v1 club counts while avoiding
 * DB lock saturation.
 *
 * Error policy:
 *   - Job failures are isolated per club — one club failure does NOT abort
 *     other clubs in the same cron wave. BullMQ applies exponential backoff
 *     (max 2 attempts as configured in acwrRefreshQueue).
 *   - On exhaustion, data for that club will simply be refreshed in the next
 *     4-hour cron tick, keeping worst-case lag ≤ 8 hours.
 *   - DB errors from `refreshAcwrAggregates` are re-thrown so BullMQ can
 *     retry with the configured backoff.
 *
 * Idempotency: REFRESH MATERIALIZED VIEW is always a full replace of view
 * contents — reprocessing the same job is safe and produces no duplicates.
 */
export function startAcwrRefreshWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<RefreshClubAcwrJobData>(
    "acwr-refresh",
    async (
      job: Job<RefreshClubAcwrJobData>,
    ): Promise<RefreshAcwrResult | undefined> => {
      if (job.name !== ACWR_REFRESH_JOB_NAMES.REFRESH_CLUB_ACWR) return;

      const { clubId } = job.data;

      job.log(
        `[acwr-refresh] Club ${clubId} — starting ACWR aggregate refresh`,
      );

      const result = await refreshAcwrAggregates(prisma, clubId);

      job.log(
        `[acwr-refresh] Club ${clubId} — ` +
          `concurrent: ${result.concurrent}, ` +
          `durationMs: ${result.durationMs}ms`,
      );

      return result;
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as RefreshAcwrResult | undefined;
    if (r) {
      console.info(
        `[acwr-refresh] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `concurrent: ${r.concurrent}, durationMs: ${r.durationMs}ms`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[acwr-refresh] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
