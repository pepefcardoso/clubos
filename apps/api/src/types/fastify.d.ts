import type { PrismaClient } from "../../generated/prisma/index.js";
import type { Redis } from "ioredis";
import type { Queue } from "bullmq";
import type { WebhookJobData } from "../modules/webhooks/webhooks.service.js";
import type { RefreshJwt } from "../plugins/auth.plugin.js";

export interface AccessTokenPayload {
  sub: string;
  clubId: string;
  role: "ADMIN" | "TREASURER" | "PHYSIO";
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
     * Refresh-token JWT signer / verifier.
     * Uses JWT_REFRESH_SECRET via HS256 (Node.js built-in crypto).
     * Separate from fastify.jwt so access and refresh tokens use different secrets.
     */
    refresh: RefreshJwt;
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
     * Returns a preHandler that enforces role-based access control.
     *
     * **Single-role form (linear hierarchy — backward-compatible):**
     * ```ts
     * requireRole('ADMIN')     // ADMIN only
     * requireRole('TREASURER') // TREASURER or ADMIN
     * ```
     * Role levels: ADMIN(2) ≥ TREASURER(1) > PHYSIO(0)
     * PHYSIO is blocked from all financial routes automatically (level 0 < 1).
     *
     * **Multi-role OR-allowlist form (for FisioBase clinical routes):**
     * ```ts
     * requireRole('ADMIN', 'PHYSIO') // ADMIN or PHYSIO — TREASURER is blocked
     * ```
     *
     * Must be used AFTER verifyAccessToken in the preHandler chain. Inside
     * `protectedRoutes`, verifyAccessToken is already applied by the plugin-level
     * hook — do NOT repeat it in the route's preHandler array.
     *
     * Responds 403 Forbidden if the authenticated user's role is not permitted.
     */
    requireRole: (
      ...allowedRoles: Array<"ADMIN" | "TREASURER" | "PHYSIO">
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
