import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { expireLapsedSubscriptions } from "../../modules/scoutlink/billing/scout-billing.service.js";
import {
  SCOUT_SUBSCRIPTION_EXPIRY_JOB_NAMES,
  type ScoutSubscriptionExpiryJobData,
} from "./scout-subscription-expiry.types.js";

/**
 * Daily cron worker — expires all ACTIVE scout subscriptions whose
 * `subscriptionExpiresAt` is in the past.
 *
 * Single `updateMany` on public schema — no fan-out needed.
 * Concurrency = 1 (one coordinator job; no parallel benefit).
 */
export function startScoutSubscriptionExpiryWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<ScoutSubscriptionExpiryJobData>(
    "scout-subscription-expiry",
    async (job: Job<ScoutSubscriptionExpiryJobData>) => {
      if (
        job.name !==
        SCOUT_SUBSCRIPTION_EXPIRY_JOB_NAMES.EXPIRE_LAPSED_SUBSCRIPTIONS
      )
        return;

      job.log(`[scout-expiry] Running lapsed subscription expiry`);

      const { expired } = await expireLapsedSubscriptions(prisma);

      job.log(`[scout-expiry] Expired ${expired} subscription(s)`);
      return { expired };
    },
    { connection, concurrency: 1 },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[scout-expiry] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[scout-expiry] Job ${job?.id} failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
