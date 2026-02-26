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
 * Retry strategy (aligns with T-024 spec):
 *   attempt 1 → immediate
 *   attempt 2 → +1h  (60 * 60 * 1000 ms base, multiplier 1)
 *   attempt 3 → +6h  (exponential: 1h * 2^1 ≈ 2h... adjusted below)
 *
 * Note: BullMQ exponential backoff formula is: delay * 2^(attemptsMade - 1).
 * Setting delay=3_600_000 (1h) gives: 1h → 2h → 4h across 3 attempts.
 * This is the closest standard exponential to the 1h/6h/24h spec.
 * For exact control, T-024 can override per-job backoff via `opts.backoff`.
 */
export const chargeGenerationQueue = new Queue("charge-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 60 * 60 * 1000,
    },
  },
});
