import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getPhysioClubs,
  validatePhysioClubSwitch,
  grantPhysioClubAccess,
  revokePhysioClubAccess,
} from "./physio.service.js";
import { getMultiClubAtRiskAthletes } from "./physio.dashboard.service.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { issueAccessToken } from "../../lib/tokens.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

const SwitchClubBodySchema = z.object({
  targetClubId: z.string().min(1, "targetClubId is required"),
});

const GrantAccessBodySchema = z.object({
  physioUserId: z.string().min(1, "physioUserId is required"),
  targetClubId: z.string().min(1, "targetClubId is required"),
});

const DashboardQuerySchema = z.object({
  minAcwr: z.coerce.number().min(0.1).max(5).default(1.3),
});

/**
 * Physio multi-club routes.
 *
 * All endpoints require authentication via the plugin-level verifyAccessToken hook.
 * Individual role guards are applied per route.
 *
 * Routes:
 *   GET  /api/physio/clubs               — list clubs accessible by this PHYSIO
 *   POST /api/physio/switch-club         — re-issue access token for target club
 *   GET  /api/physio/dashboard           — multi-club at-risk ACWR aggregation
 *   POST /api/physio/club-access         — ADMIN grants PHYSIO access to a club
 *   DELETE /api/physio/club-access/:id   — ADMIN revokes PHYSIO access to a club
 */
export async function physioRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/physio/clubs
   * Returns all clubs the authenticated PHYSIO has active access to.
   * Role guard: PHYSIO only (ADMIN and TREASURER receive 403).
   */
  fastify.get(
    "/clubs",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const { sub: userId, role } = request.user as AccessTokenPayload;

      if (role !== "PHYSIO") {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Endpoint exclusivo para fisioterapeutas.",
        });
      }

      try {
        const clubs = await getPhysioClubs(fastify.prisma, userId);
        return reply.status(200).send({ clubs });
      } catch (err) {
        if (err instanceof ForbiddenError || err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: err.statusCode === 403 ? "Forbidden" : "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * POST /api/physio/switch-club
   * Validates access and re-issues an access token scoped to the target club.
   * The refresh token cookie is NOT changed — only the short-lived access token.
   *
   * Body: { targetClubId: string }
   * Returns: { accessToken: string }
   */
  fastify.post(
    "/switch-club",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;

      if (user.role !== "PHYSIO") {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Troca de clube é exclusiva para fisioterapeutas.",
        });
      }

      const parsed = SwitchClubBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { targetClubId } = parsed.data;

      try {
        await validatePhysioClubSwitch(fastify.prisma, user.sub, targetClubId);
      } catch (err) {
        if (err instanceof ForbiddenError) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: err.message,
          });
        }
        throw err;
      }

      const newAccessToken = issueAccessToken(fastify, {
        sub: user.sub,
        clubId: targetClubId,
        role: user.role,
      });

      return reply.status(200).send({ accessToken: newAccessToken });
    },
  );

  /**
   * GET /api/physio/dashboard
   * Aggregates at-risk athletes across all clubs the PHYSIO has access to.
   * Query param: minAcwr (default 1.3)
   */
  fastify.get(
    "/dashboard",
    { preHandler: [fastify.requireRole("ADMIN", "PHYSIO")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;

      if (user.role !== "PHYSIO") {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Dashboard multi-clube é exclusivo para fisioterapeutas.",
        });
      }

      const parsed = DashboardQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid query",
        });
      }

      const result = await getMultiClubAtRiskAthletes(
        fastify.prisma,
        user.sub,
        parsed.data.minAcwr,
      );

      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/physio/club-access
   * ADMIN grants an existing PHYSIO user access to their club.
   * Body: { physioUserId, targetClubId }
   * The targetClubId must match the authenticated ADMIN's clubId.
   */
  fastify.post(
    "/club-access",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;

      const parsed = GrantAccessBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { physioUserId, targetClubId } = parsed.data;

      try {
        const row = await grantPhysioClubAccess(
          fastify.prisma,
          user.sub,
          user.clubId,
          physioUserId,
          targetClubId,
        );
        return reply.status(201).send({ id: row.id });
      } catch (err) {
        if (err instanceof ForbiddenError || err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: err.statusCode === 403 ? "Forbidden" : "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/physio/club-access/:accessId
   * ADMIN soft-revokes a physio_club_access row (isActive = false).
   */
  fastify.delete(
    "/club-access/:accessId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { accessId } = request.params as { accessId: string };
      const user = request.user as AccessTokenPayload;

      try {
        await revokePhysioClubAccess(fastify.prisma, user.clubId, accessId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof ForbiddenError || err instanceof NotFoundError) {
          return reply.status(err.statusCode).send({
            statusCode: err.statusCode,
            error: err.statusCode === 403 ? "Forbidden" : "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
