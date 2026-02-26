import { Queue } from "bullmq";
import { getRedisClient } from "../lib/redis.js";

const connection = getRedisClient();

/**
 * Single queue for all charge-generation jobs (dispatch + per-club generation).
 *
 * Keeping both job types in one queue:
 * - Simplifies monitoring in Bull Board / BullMQ UI.
 * - Enforces a single concurrency cap across all charge work.
 * - Avoids the overhead of managing multiple QueueSchedulers.
 *
 * Retry strategy (T-024):
 *   attempt 1 → wait  1h  → attempt 2
 *   attempt 2 → wait  6h  → attempt 3
 *   attempt 3 → wait 24h  → EXHAUSTED → charges set to PENDING_RETRY
 *
 * Backoff type is "custom" — the actual per-attempt delays are resolved by
 * the Worker's `settings.backoffStrategy` function in charge-generation.worker.ts.
 * The queue only needs to declare the type as "custom" as a signal to BullMQ.
 */
export const chargeGenerationQueue = new Queue("charge-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 3,
    backoff: {
      type: "custom",
    },
  },
});
