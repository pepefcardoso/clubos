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

/**
 * Queue for all billing reminder jobs (daily dispatch + per-club WhatsApp sends).
 *
 * Separate from `charge-generation` to allow:
 * - Independent concurrency caps and retry policies.
 * - Isolated monitoring — reminder failures don't pollute charge job metrics.
 *
 * Retry strategy (T-033):
 *   attempt 1 fails → wait 5s  → attempt 2 (exponential: 10s, 20s, …)
 *   Max 2 attempts — more retries risk duplicate sends if the failure was partial.
 *
 * Rate-limit triggered retries are handled by the worker throwing when
 * all charges were blocked; BullMQ applies the backoff automatically.
 */
export const billingReminderQueue = new Queue("billing-reminders", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
  },
});

/**
 * Queue for D+3 overdue notice jobs (daily dispatch + per-club WhatsApp sends).
 *
 * Separate from `billingReminderQueue` for:
 * - Independent monitoring — overdue notice failures are distinct from D-3
 *   reminder failures and must not pollute each other's metrics.
 * - Independent retry policies and concurrency tuning.
 * - Avoiding resource contention: the D-3 reminder cron (09:00 UTC) and the
 *   overdue notice cron (10:00 UTC) are intentionally staggered so both queues
 *   do not compete for per-club WhatsApp rate-limit slots simultaneously.
 *
 * Retry strategy (T-034):
 *   attempt 1 fails → wait 5s → attempt 2 (exponential backoff).
 *   Max 2 attempts — same reasoning as billing reminders (duplicate send risk).
 */
export const overdueNoticeQueue = new Queue("overdue-notices", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
  },
});
