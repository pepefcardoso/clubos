import type { PrismaClient } from "../../generated/prisma/index.js";
import type { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { WebhookJobData } from "../modules/webhooks/webhooks.service.js";

export interface AccessTokenPayload {
  sub: string;
  clubId: string;
  role: "ADMIN" | "TREASURER";
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    /** BullMQ queue for incoming webhook events. Populated in buildApp(). */
    webhookQueue: Queue<WebhookJobData>;
    /**
     * Verifies the Bearer access token from the Authorization header.
     * Populates `request.user` on success.
     * Responds 401 if missing, expired, or invalid.
     */
    verifyAccessToken: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<void>;
    /**
     * Verifies the refresh token from the httpOnly cookie.
     * Consumes the token from Redis (single-use enforcement).
     * Populates `request.refreshPayload` on success.
     * Responds 401 if missing, expired, invalid, or already rotated out.
     */
    verifyRefreshToken: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<void>;
    /**
     * Returns a preHandler that enforces a minimum role level.
     *
     * Role hierarchy: ADMIN > TREASURER
     * An ADMIN satisfies any role requirement (including TREASURER).
     *
     * Must be used AFTER verifyAccessToken in the preHandler chain:
     * ```ts
     * preHandler: [fastify.requireRole('ADMIN')]
     * ```
     * When used inside `protectedRoutes`, verifyAccessToken is already applied
     * by the plugin-level hook — do NOT repeat it in the route's preHandler.
     *
     * Responds 403 Forbidden if the authenticated user's role is insufficient.
     */
    requireRole: (
      minimumRole: "ADMIN" | "TREASURER",
    ) => (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<void>;
  }

  interface FastifyRequest {
    /**
     * Populated after `verifyAccessToken` runs successfully.
     */
    user: AccessTokenPayload;
    /**
     * Populated after `verifyRefreshToken` runs successfully.
     */
    refreshPayload: RefreshTokenPayload;
    /**
     * Populated by the `protectedRoutes` plugin hook (after verifyAccessToken).
     * Convenience shorthand for `request.user.sub` — use this in AuditLog entries.
     *
     * Only available inside routes registered within `protectedRoutes`.
     */
    actorId: string;
  }
}