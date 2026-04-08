import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { GatewayRegistry } from "../payments/gateway.registry.js";
import { WebhookSignatureError } from "../payments/gateway.interface.js";
import {
  enqueueWebhookEvent,
  checkAndMarkWebhookDedup,
  type WebhookJobData,
} from "./webhooks.service.js";

/**
 * webhookRoutes — public Fastify plugin
 *
 * Registers: POST /webhooks/:gateway
 *
 * This route MUST be registered OUTSIDE protectedRoutes (no JWT guard).
 * Authentication is performed exclusively via HMAC/token validation inside
 * PaymentGateway.parseWebhook().
 *
 * Five-step flow:
 *   1. Resolve the gateway from GatewayRegistry (404 → unknown provider)
 *   2. Validate signature via parseWebhook()       (401 → tampered/missing)
 *   3. Redis SET NX dedup check     (200 → duplicate, no enqueue)
 *   4. Enqueue the normalised event in BullMQ      (500 → infrastructure failure)
 *   5. Respond HTTP 200 immediately                (PSP must never time out)
 *
 * Raw-body capture:
 *   Signature validation requires the exact bytes that were sent over the wire.
 *   The `addContentTypeParser` override for `application/json` captures the body
 *   as a Buffer before Fastify's default JSON parser can mutate it.
 *   This override is scoped to this plugin only (Fastify encapsulation model) —
 *   all other routes keep standard JSON parsing.
 *
 * Replay protection:
 *   After successful signature validation, a Redis SET NX gate prevents the same
 *   (gateway, gatewayTxId) pair from being enqueued more than once within 24 hours.
 *   This is layer 1 of a three-layer defence:
 *     L1 — Redis SET NX (this file)
 *     L2 — BullMQ deterministic jobId (webhooks.service.ts)
 *     L3 — DB unique constraint on gatewayTxid (webhooks.worker.ts)
 *   Fail-open: if Redis is temporarily unavailable, layers L2 and L3 remain active.
 */
export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );

  fastify.post<{ Params: { gateway: string } }>(
    "/:gateway",
    async (request, reply) => {
      const { gateway } = request.params;

      let gatewayInstance: ReturnType<typeof GatewayRegistry.get>;
      try {
        gatewayInstance = GatewayRegistry.get(gateway);
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `Unknown gateway: "${gateway}"`,
        });
      }

      let event: ReturnType<typeof gatewayInstance.parseWebhook>;
      try {
        event = gatewayInstance.parseWebhook(
          request.body as Buffer,
          request.headers as Record<string, string | string[] | undefined>,
        );
      } catch (err) {
        if (err instanceof WebhookSignatureError) {
          fastify.log.warn(
            { gateway, ip: request.ip },
            "[webhook] Rejected: invalid signature",
          );
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Invalid webhook signature",
          });
        }
        throw err;
      }

      let isNewEvent = true;
      try {
        isNewEvent = await checkAndMarkWebhookDedup(
          fastify.redis,
          gateway,
          event.gatewayTxId,
        );
      } catch (dedupErr) {
        fastify.log.warn(
          { gateway, gatewayTxId: event.gatewayTxId, err: dedupErr },
          "[webhook] Redis dedup check failed — proceeding without HTTP-boundary guard",
        );
      }

      if (!isNewEvent) {
        fastify.log.warn(
          { gateway, gatewayTxId: event.gatewayTxId },
          "[webhook] Replay detected at HTTP boundary — duplicate event discarded",
        );
        return reply.status(200).send({ received: true });
      }

      const webhookQueue = fastify.webhookQueue as Queue<WebhookJobData>;
      await enqueueWebhookEvent(webhookQueue, gateway, event);

      fastify.log.info(
        { gateway, eventType: event.type, gatewayTxId: event.gatewayTxId },
        "[webhook] Event enqueued",
      );

      return reply.status(200).send({ received: true });
    },
  );
}
