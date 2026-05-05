import type { FastifyInstance } from "fastify";
import { PurchaseTicketInputSchema } from "./tickets.schema.js";
import { purchaseTicket, getPublicEventDetails } from "./tickets.service.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../../lib/errors.js";

export async function ticketPublicRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/events/:clubSlug/:eventId
   *
   * Public endpoint — returns event info + sector availability for the purchase page.
   * ISR-friendly: response is safe to cache for short TTLs (30s) at the CDN layer.
   *
   * Error codes:
   *   404 — unknown clubSlug, eventId, or CANCELLED event
   */
  fastify.get<{
    Params: { clubSlug: string; eventId: string };
  }>("/:clubSlug/:eventId", async (request, reply) => {
    const { clubSlug, eventId } = request.params;
    try {
      const result = await getPublicEventDetails(
        fastify.prisma,
        clubSlug,
        eventId,
      );
      return reply.status(200).send(result);
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
      throw err;
    }
  });

  /**
   * POST /api/events/:clubSlug/:eventId/tickets/purchase
   * (unchanged — see original file)
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
