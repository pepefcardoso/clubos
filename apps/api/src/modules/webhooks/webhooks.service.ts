import type { Queue } from "bullmq";
import type { WebhookEvent } from "../payments/gateway.interface.js";

export interface WebhookJobData {
  gatewayName: string;
  event: WebhookEvent;
  /** ISO string — when the HTTP request was received by the API */
  receivedAt: string;
}

/**
 * Enqueues a normalised webhook event for async processing by the
 * BullMQ worker (T-027 and beyond).
 *
 * Design decisions:
 * - `jobId` is deterministic on gatewayTxId so BullMQ deduplicates
 *   retransmissions from the PSP within the active job window.
 * - `removeOnComplete` keeps successful jobs for 24 h for debugging.
 * - `removeOnFail` retains failed jobs for 7 days so ops can inspect them.
 *
 * Idempotency at the business layer (duplicate Payment guard) is handled
 * separately in T-028 — this enqueue is intentionally lightweight.
 *
 * @param queue       The BullMQ Queue decorated onto the Fastify instance.
 * @param gatewayName Canonical gateway name (e.g. "asaas").
 * @param event       Normalised WebhookEvent from parseWebhook().
 */
export async function enqueueWebhookEvent(
  queue: Queue<WebhookJobData>,
  gatewayName: string,
  event: WebhookEvent,
): Promise<void> {
  const jobId = `webhook:${gatewayName}:${event.gatewayTxId}`;

  await queue.add(
    "process-webhook",
    {
      gatewayName,
      event,
      receivedAt: new Date().toISOString(),
    },
    {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 7 * 86_400 },
    },
  );
}
