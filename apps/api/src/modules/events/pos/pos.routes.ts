import type { FastifyInstance } from "fastify";
import { NotFoundError } from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import { checkRouteRateLimit } from "../../../lib/route-rate-limit.js";
import { PosChargeInputSchema } from "./pos.schema.js";
import { createPosCharge } from "./pos.service.js";

const POS_RATE_LIMIT_MAX = 200;
const POS_RATE_LIMIT_WINDOW_MS = 60_000;

export async function posRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/events/:eventId/pos/charge
   *
   * Creates a POS sale: attempts mPOS (Stone/SumUp), falls back to PIX.
   * Requires ADMIN or TREASURER — PHYSIO receives 403 (requireRole runs first).
   *
   * Rate limit: 200 req/min per club (per-club bucket, not per-user).
   * requireRole runs before the rate-limit handler so unauthenticated/unauthorized
   * requests are rejected before consuming quota.
   *
   * Error codes:
   *   201 — sale created
   *   400 — invalid body
   *   403 — insufficient role
   *   404 — eventId not found in caller's tenant schema
   *   429 — rate limit exceeded
   */
  fastify.post<{ Params: { eventId: string } }>(
    "/:eventId/pos/charge",
    {
      preHandler: [
        fastify.requireRole("ADMIN", "TREASURER"),
        async (request, reply) => {
          const { clubId } = request.user as AccessTokenPayload;
          const rl = await checkRouteRateLimit(
            fastify.redis,
            `pos:${clubId}`,
            POS_RATE_LIMIT_MAX,
            POS_RATE_LIMIT_WINDOW_MS,
          );
          if (!rl.allowed) {
            return reply.status(429).send({
              statusCode: 429,
              error: "Too Many Requests",
              message: `Rate limit exceeded. Retry in ${Math.ceil(rl.retryAfterMs / 1000)}s.`,
            });
          }
        },
      ],
    },
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
