import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import { GatewayRegistry } from "../payments/gateway.registry.js";
import { WebhookSignatureError } from "../payments/gateway.interface.js";
import {
  enqueueWebhookEvent,
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
 * Four-step flow:
 *   1. Resolve the gateway from GatewayRegistry (404 → unknown provider)
 *   2. Validate signature via parseWebhook()       (401 → tampered/missing)
 *   3. Enqueue the normalised event in BullMQ      (500 → infrastructure failure)
 *   4. Respond HTTP 200 immediately                (PSP must never time out)
 *
 * Raw-body capture:
 *   Signature validation requires the exact bytes that were sent over the wire.
 *   The `addContentTypeParser` override for `application/json` captures the body
 *   as a Buffer before Fastify's default JSON parser can mutate it.
 *   This override is scoped to this plugin only (Fastify encapsulation model) —
 *   all other routes keep standard JSON parsing.
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
