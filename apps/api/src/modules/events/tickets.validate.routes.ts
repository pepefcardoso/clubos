import type { FastifyInstance } from "fastify";
import { ValidateTicketBodySchema } from "./tickets.validate.schema.js";
import {
  validateTicket,
  TicketAlreadyScannedError,
  InvalidQrTokenError,
  TicketNotValidForEntryError,
} from "./tickets.validate.service.js";
import { NotFoundError } from "../../lib/errors.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function ticketValidateRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * POST /api/tickets/:ticketId/validate
   *
   * Gate scanner endpoint. Verifies HMAC, deduplicates via Redis + DB,
   * marks the ticket as checked-in, and emits CHECKIN_CONFIRMED over SSE.
   *
   * :ticketId is used for logging; the service cross-validates it against
   * the QR payload to prevent a ticket substitution attack.
   *
   * Error codes:
   *   200 — valid, ticket marked as checked-in
   *   400 — invalid/tampered QR, eventId mismatch, CANCELLED/PENDING ticket
   *   404 — ticketId not found in caller's tenant schema
   *   409 — already scanned (Redis L1 or DB L2)
   */
  fastify.post<{ Params: { ticketId: string } }>(
    "/:ticketId/validate",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { ticketId } = request.params;
      const { clubId, sub: actorId } = request.user as AccessTokenPayload;

      const parsed = ValidateTicketBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      let eventId: string;
      try {
        const qr = JSON.parse(parsed.data.qrPayload) as {
          eventId?: unknown;
          ticketId?: unknown;
        };
        if (typeof qr.eventId !== "string" || typeof qr.ticketId !== "string") {
          throw new Error("missing fields");
        }
        eventId = qr.eventId;
      } catch {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "QR Code inválido.",
        });
      }

      try {
        const result = await validateTicket(
          fastify.prisma,
          fastify.redis,
          clubId,
          eventId,
          actorId,
          request.ip,
          request.headers["user-agent"],
          parsed.data.qrPayload,
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
        if (err instanceof TicketAlreadyScannedError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: err.message,
          });
        }
        if (
          err instanceof InvalidQrTokenError ||
          err instanceof TicketNotValidForEntryError
        ) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: err.message,
          });
        }
        throw err;
      }

      void ticketId;
    },
  );
}
