import type { FastifyInstance } from "fastify";
import { GenerateMonthlyChargesSchema } from "./charges.schema.js";
import {
  generateMonthlyCharges,
  NoActivePlanError,
} from "./charges.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function chargeRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/charges/generate
   *
   * Manually triggers monthly charge generation for the authenticated club.
   * Equivalent to the BullMQ cron job (T-023) but HTTP-triggered, so a
   * TREASURER can kick it off outside the scheduled window.
   *
   * Available to: ADMIN, TREASURER (both roles are valid — no requireRole guard
   * needed beyond the verifyAccessToken already applied by protectedRoutes).
   *
   * Body (all fields optional):
   *   billingPeriod — ISO datetime; only year/month are used. Defaults to the
   *                   current UTC month.
   *   dueDate       — ISO datetime override for the charge due date. Defaults to
   *                   the last day of the billing month.
   *
   * Returns the full ChargeGenerationResult so the caller can immediately display
   * QR codes and summaries without a second round-trip.
   *
   * Partial failure (some members errored, some gateway calls failed) still
   * returns 200 — callers should inspect `errors[]` and `gatewayErrors[]`.
   *
   * Idempotent: calling this endpoint twice in the same month produces
   * `generated: 0, skipped: N` on the second call (handled by the service layer).
   */
  fastify.post("/generate", async (request, reply) => {
    const parseResult = GenerateMonthlyChargesSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const actorId = request.actorId;

    try {
      const result = await generateMonthlyCharges(
        fastify.prisma,
        clubId,
        actorId,
        parseResult.data,
      );

      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof NoActivePlanError) {
        return reply.status(422).send({
          statusCode: 422,
          error: "Unprocessable Entity",
          message: err.message,
        });
      }

      throw err;
    }
  });
}
