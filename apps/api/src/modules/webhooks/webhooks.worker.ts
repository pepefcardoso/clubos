import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  hasExistingPayment,
  resolveClubIdFromChargeId,
  type WebhookJobData,
} from "./webhooks.service.js";

/**
 * Starts the webhook event processing worker.
 *
 * Responsibility scope for T-028:
 *   - Dequeue webhook events from the "webhook-events" BullMQ queue.
 *   - Resolve the tenant (clubId) from event.externalReference.
 *   - Check idempotency via hasExistingPayment() before any write.
 *   - Log a clear message and return early if duplicate detected.
 *
 * T-027 will extend the processor with the full PAYMENT_RECEIVED handler
 * (create Payment, update Charge, update Member status).
 *
 * Two-layer idempotency:
 *   Layer 1 — BullMQ: deterministic jobId prevents enqueueing the same
 *             gatewayTxId twice while a job is still in the queue.
 *   Layer 2 — DB (this file): checks payments table before any write,
 *             protecting against retries and post-completion redelivery.
 *
 * Concurrency: 5 (matches architecture-rules.md cap for financial jobs).
 */
export function startWebhookWorker(): Worker<WebhookJobData> {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<WebhookJobData>(
    "webhook-events",
    async (job: Job<WebhookJobData>) => {
      const { event, gatewayName, receivedAt } = job.data;

      job.log(
        `[webhook-worker] Processing ${event.type} from ${gatewayName} ` +
          `(gatewayTxId: ${event.gatewayTxId}, received: ${receivedAt})`,
      );

      if (event.type === "UNKNOWN") {
        job.log(`[webhook-worker] Skipping UNKNOWN event type — no-op`);
        return { skipped: true, reason: "unknown_event_type" };
      }

      const chargeId = event.externalReference;
      if (!chargeId) {
        job.log(
          `[webhook-worker] No externalReference on event — cannot resolve tenant. Discarding.`,
        );
        return { skipped: true, reason: "no_external_reference" };
      }

      let clubId = job.data.clubId;
      if (!clubId) {
        const resolved = await resolveClubIdFromChargeId(prisma, chargeId);
        if (!resolved) {
          job.log(
            `[webhook-worker] Could not resolve clubId for chargeId "${chargeId}". ` +
              `Event may reference a deleted or unknown charge. Discarding.`,
          );
          return { skipped: true, reason: "charge_not_found" };
        }
        clubId = resolved;

        await job.updateData({ ...job.data, clubId });
      }

      const isDuplicate = await hasExistingPayment(
        prisma,
        clubId,
        event.gatewayTxId,
      );

      if (isDuplicate) {
        job.log(
          `[webhook-worker] Duplicate event detected — gatewayTxId "${event.gatewayTxId}" ` +
            `already exists in payments table for club "${clubId}". Skipping.`,
        );
        return { skipped: true, reason: "duplicate_gateway_txid" };
      }

      if (event.type === "PAYMENT_RECEIVED") {
        job.log(
          `[webhook-worker] PAYMENT_RECEIVED — idempotency passed for ` +
            `gatewayTxId "${event.gatewayTxId}" (club: ${clubId}). ` +
            `Full handler to be implemented in T-027.`,
        );

        // TODO T-027: return handlePaymentReceived(prisma, clubId, event);

        return { processed: false, reason: "handler_pending_t027" };
      }

      if (event.type === "PAYMENT_OVERDUE") {
        job.log(
          `[webhook-worker] PAYMENT_OVERDUE — no handler yet for gatewayTxId "${event.gatewayTxId}".`,
        );
        return { skipped: true, reason: "unhandled_event_type" };
      }

      if (event.type === "PAYMENT_REFUNDED") {
        job.log(
          `[webhook-worker] PAYMENT_REFUNDED — no handler yet for gatewayTxId "${event.gatewayTxId}".`,
        );
        return { skipped: true, reason: "unhandled_event_type" };
      }

      job.log(
        `[webhook-worker] Event type "${event.type}" has no registered handler.`,
      );
      return { skipped: true, reason: "unhandled_event_type" };
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    console.info(`[webhook-worker] Job ${job.id} completed:`, result);
  });

  worker.on("failed", (job, err) => {
    try {
      console.error(
        `[webhook-worker] Job ${job?.id ?? "unknown"} failed after ` +
          `${job?.attemptsMade ?? 0} attempt(s): ${err.message}`,
      );
    } catch {
      // Swallow any secondary error in the error handler itself.
    }
  });

  return worker;
}
