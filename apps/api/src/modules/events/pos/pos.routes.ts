import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import { PosChargeInputSchema } from "./pos.schema.js";
import { createPosCharge } from "./pos.service.js";

export async function posRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/events/:eventId/pos/charge
   *
   * Creates a POS sale: attempts mPOS (Stone/SumUp), falls back to PIX.
   * Requires ADMIN or TREASURER — COACH and PHYSIO receive 403.
   *
   * Error codes:
   *   201 — sale created
   *   400 — invalid body
   *   403 — insufficient role
   *   404 — eventId not found in caller's tenant schema
   */
  fastify.post<{ Params: { eventId: string } }>(
    "/:eventId/pos/charge",
    { preHandler: [fastify.requireRole("ADMIN", "TREASURER")] },
    async (request, reply) => {
      const { eventId } = request.params;
      const { clubId, sub: actorId } = request.user as AccessTokenPayload;

      const parsed = PosChargeInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      try {
        const result = await createPosCharge(
          fastify.prisma,
          clubId,
          eventId,
          actorId,
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
        throw err;
      }
    },
  );
}
