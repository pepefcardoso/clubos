import type { FastifyInstance } from "fastify";
import { PurchaseTicketInputSchema } from "./tickets.schema.js";
import { purchaseTicket, getPublicEventDetails } from "./tickets.service.js";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../../lib/errors.js";
import { checkRouteRateLimit } from "../../lib/route-rate-limit.js";

const TICKET_PURCHASE_RATE_LIMIT_MAX = 50;
const TICKET_PURCHASE_RATE_LIMIT_WINDOW_MS = 60_000;

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
   *
   * Rate limit: 50 req/min per eventId to protect gateway throughput and
   * the capacity guard inside purchaseTicket (sold >= capacity check).
   * Bucket is per-event so a spike on one event does not block others.
   *
   * Error codes:
   *   201 — ticket created
   *   400 — invalid body
   *   404 — unknown club or event
   *   409 — duplicate purchase (same fan + event + sector)
   *   422 — event not available or sector sold out
   *   429 — rate limit exceeded
   */
  fastify.post<{
    Params: { clubSlug: string; eventId: string };
  }>("/:clubSlug/:eventId/tickets/purchase", async (request, reply) => {
    const { clubSlug, eventId } = request.params;

    const rl = await checkRouteRateLimit(
      fastify.redis,
      `ticket-purchase:${eventId}`,
      TICKET_PURCHASE_RATE_LIMIT_MAX,
      TICKET_PURCHASE_RATE_LIMIT_WINDOW_MS,
    );
    if (!rl.allowed) {
      return reply.status(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Retry in ${Math.ceil(rl.retryAfterMs / 1000)}s.`,
      });
    }

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
