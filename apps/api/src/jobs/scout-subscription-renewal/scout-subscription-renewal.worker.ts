import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import { GatewayRegistry } from "../../modules/payments/gateway.registry.js";
import {
  SCOUT_SUBSCRIPTION_PRICE_CENTS,
  buildBillingRef,
} from "../../modules/scoutlink/billing/scout-billing.service.js";
import {
  SCOUT_SUBSCRIPTION_RENEWAL_JOB_NAMES,
  type ScoutSubscriptionRenewalJobData,
} from "./scout-subscription-renewal.types.js";
import { addDays } from "date-fns";

/**
 * Processes delayed per-scout renewal jobs.
 *
 * Idempotency: scout_billing_payments (scoutId, billingCycle) unique constraint
 * prevents double-charging if the job fires more than once.
 *
 * Early exits:
 *   - Scout is INACTIVE (cancelled before renewal fired) → no charge, no error.
 *   - billingCycle already paid → skip.
 */
export function startScoutSubscriptionRenewalWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<ScoutSubscriptionRenewalJobData>(
    "scout-subscription-renewal",
    async (job: Job<ScoutSubscriptionRenewalJobData>) => {
      if (
        job.name !==
        SCOUT_SUBSCRIPTION_RENEWAL_JOB_NAMES.RENEW_SCOUT_SUBSCRIPTION
      )
        return;

      const { scoutId, billingCycle } = job.data;
      job.log(`[scout-renewal] Scout ${scoutId} — cycle ${billingCycle}`);

      const scout = await prisma.scoutProfile.findUnique({
        where: { id: scoutId },
        select: { subscriptionStatus: true, name: true, email: true },
      });

      if (!scout) {
        job.log(`[scout-renewal] Scout ${scoutId} not found — discarding`);
        return { skipped: true, reason: "scout_not_found" };
      }

      if (scout.subscriptionStatus !== "ACTIVE") {
        job.log(
          `[scout-renewal] Scout ${scoutId} is ${scout.subscriptionStatus} — skipping renewal`,
        );
        return { skipped: true, reason: "subscription_not_active" };
      }

      const existing = await prisma.scoutBillingPayment.findUnique({
        where: { scoutId_billingCycle: { scoutId, billingCycle } },
        select: { id: true },
      });
      if (existing) {
        job.log(
          `[scout-renewal] Cycle ${billingCycle} already paid — skipping`,
        );
        return { skipped: true, reason: "already_paid" };
      }

      const idempotencyKey = buildBillingRef(scoutId, billingCycle);
      const gateway = GatewayRegistry.forMethod("PIX");

      await gateway.createCharge({
        amountCents: SCOUT_SUBSCRIPTION_PRICE_CENTS,
        dueDate: addDays(new Date(), 3),
        method: "PIX",
        customer: { name: scout.name, email: scout.email, cpf: "", phone: "" },
        description: `ClubOS ScoutLink — assinatura ${billingCycle}`,
        idempotencyKey,
        externalReference: idempotencyKey,
      });

      job.log(
        `[scout-renewal] PIX charge created for scout ${scoutId} cycle ${billingCycle}`,
      );
      return { processed: true, scoutId, billingCycle };
    },
    { connection, concurrency: 3 },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[scout-renewal] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[scout-renewal] Job ${job?.id} (scout: ${job?.data?.scoutId}) failed — ` +
        `attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
