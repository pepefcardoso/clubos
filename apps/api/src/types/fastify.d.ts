import type { PrismaClient } from "../../generated/prisma/index.js";
import type { Redis } from "ioredis";

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
    /**
     * Verifies the Bearer access token from the Authorization header.
     * Throws 401 if missing, expired, or invalid.
     */
    verifyAccessToken: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<void>;
    /**
     * Verifies the refresh token from the httpOnly cookie.
     * Throws 401 if missing, expired, invalid, or already rotated out.
     */
    verifyRefreshToken: (
      request: import("fastify").FastifyRequest,
      reply: import("fastify").FastifyReply,
    ) => Promise<void>;
  }

  interface FastifyRequest {
    /**
     * Populated after verifyAccessToken runs.
     */
    user: AccessTokenPayload;
    /**
     * Populated after verifyRefreshToken runs.
     */
    refreshPayload: RefreshTokenPayload;
  }
}
