import type { FastifyInstance } from "fastify";
import { CancelTicketInputSchema } from "./tickets.schema.js";
import {
  cancelTicket,
  TicketAlreadyCancelledError,
  TicketCheckedInError,
  TicketCancellationWindowError,
} from "./tickets.service.js";
import { NotFoundError } from "../../lib/errors.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function ticketAdminRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * DELETE /api/tickets/:ticketId
   *
   * Cancels a ticket and triggers a gateway refund when applicable.
   * Requires ADMIN role — TREASURER and PHYSIO receive 403.
   *
   * Business rules enforced by cancelTicket():
   *   - ticket must not be checked in
   *   - ticket must not already be CANCELLED
   *   - event must be > 24h away
   *
   * Error codes:
   *   204 — cancelled successfully
   *   400 — checkedIn / within 24h window / validation failure
   *   404 — ticket not found (own tenant only — cross-tenant returns same 404)
   *   409 — ticket already cancelled
   */
  fastify.delete<{ Params: { ticketId: string } }>(
    "/:ticketId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { ticketId } = request.params;
      const { clubId, sub: actorId } = request.user as AccessTokenPayload;

      const parsed = CancelTicketInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      try {
        await cancelTicket(
          fastify.prisma,
          clubId,
          ticketId,
          parsed.data.reason,
          actorId,
        );
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (
          err instanceof TicketCheckedInError ||
          err instanceof TicketCancellationWindowError
        ) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: err.message,
          });
        }
        if (err instanceof TicketAlreadyCancelledError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
