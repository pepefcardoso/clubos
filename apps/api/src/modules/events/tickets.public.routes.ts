import type { FastifyInstance } from "fastify";
import { PurchaseTicketInputSchema } from "./tickets.schema.js";
import { purchaseTicket } from "./tickets.service.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../../lib/errors.js";

export async function ticketPublicRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /api/events/:clubSlug/:eventId/tickets/purchase
   *
   * Public endpoint — no JWT required. Fan identity is supplied in the request body.
   * Idempotent by (fanEmail, eventId, sectorId): re-submitting the same purchase
   * returns 201 with the original ticketId and a fresh PIX charge.
   *
   * Response body: PurchaseTicketResponse
   *   { ticketId, status, fanEmail, sectorName, amountCents, gatewayMeta }
   *
   * Error codes:
   *   400 — invalid body (Zod)
   *   404 — unknown clubSlug, eventId, or sectorId
   *   422 — event not SCHEDULED, or sector at capacity
   *   500 — gateway failure (ticket row not created)
   *
   * TODO: [T-158] — apply per-event rate limiting: ticket-purchase:{eventId} → 50 req/min
   */
  fastify.post<{
    Params: { clubSlug: string; eventId: string };
  }>("/:clubSlug/:eventId/tickets/purchase", async (request, reply) => {
    const { clubSlug, eventId } = request.params;

    const parsed = PurchaseTicketInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      const result = await purchaseTicket(
        fastify.prisma,
        clubSlug,
        eventId,
        parsed.data,
      );
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: err.message,
        });
      }
      if (err instanceof ValidationError) {
        return reply.status(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: err.message,
        });
      }
      if (err instanceof ConflictError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: err.message,
        });
      }
      throw err;
    }
  });
}
