import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "../types/fastify.js";
import { REFRESH_TOKEN_COOKIE } from "../lib/tokens.js";
import { consumeRefreshToken } from "../lib/redis.js";

const ROLE_HIERARCHY: Record<string, number> = {
  TREASURER: 1,
  ADMIN: 2,
};

async function authPlugin(fastify: FastifyInstance): Promise<void> {
  const jwtSecret = process.env["JWT_SECRET"];
  const jwtRefreshSecret = process.env["JWT_REFRESH_SECRET"];

  if (!jwtSecret || !jwtRefreshSecret) {
    throw new Error(
      "Missing required env vars: JWT_SECRET, JWT_REFRESH_SECRET. " +
        "Check your .env file.",
    );
  }

  await fastify.register(fastifyCookie);

  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    sign: { algorithm: "HS256" },
  });

  await fastify.register(fastifyJwt, {
    secret: jwtRefreshSecret,
    sign: { algorithm: "HS256" },
    namespace: "refresh",
  } as Parameters<typeof fastifyJwt>[1]);

  // ---------------------------------------------------------------------------
  // verifyAccessToken
  // Validates the Bearer access token from the Authorization header.
  // Throws 401 if missing, expired, or invalid.
  // ---------------------------------------------------------------------------
  fastify.decorate(
    "verifyAccessToken",
    async function (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      try {
        const payload = await request.jwtVerify<AccessTokenPayload>();

        if (payload.type !== "access") {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Invalid token type.",
          });
        }

        request.user = payload;
      } catch {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Missing or invalid access token.",
        });
      }
    },
  );

  // ---------------------------------------------------------------------------
  // verifyRefreshToken
  // Validates the refresh token from the httpOnly cookie.
  // Consumes the token from Redis (single-use enforcement).
  // Throws 401 if missing, expired, invalid, or already rotated out.
  // ---------------------------------------------------------------------------
  fastify.decorate(
    "verifyRefreshToken",
    async function (
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const rawToken = request.cookies[REFRESH_TOKEN_COOKIE];

      if (!rawToken) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Refresh token cookie missing.",
        });
      }

      let payload: RefreshTokenPayload;
      try {
        payload = await (
          request as FastifyRequest & {
            refreshVerify: <T>() => Promise<T>;
          }
        ).refreshVerify<RefreshTokenPayload>();
      } catch {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired refresh token.",
        });
      }

      if (payload.type !== "refresh") {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid token type.",
        });
      }

      const userId = await consumeRefreshToken(fastify.redis, payload.jti);

      if (!userId || userId !== payload.sub) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Refresh token has been revoked or already used.",
        });
      }

      request.refreshPayload = payload;
    },
  );

  // ---------------------------------------------------------------------------
  // requireRole
  // Returns a preHandler that enforces a minimum role level.
  // Usage: preHandler: [fastify.verifyAccessToken, fastify.requireRole('ADMIN')]
  //
  // ADMIN > TREASURER — an ADMIN can access any TREASURER-protected route.
  // ---------------------------------------------------------------------------
  fastify.decorate(
    "requireRole",
    function (
      minimumRole: "ADMIN" | "TREASURER",
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
      return async function (
        request: FastifyRequest,
        reply: FastifyReply,
      ): Promise<void> {
        const user = request.user as AccessTokenPayload;

        if (!user) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Missing or invalid access token.",
          });
        }

        const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
        const requiredLevel = ROLE_HIERARCHY[minimumRole] ?? 99;

        if (userLevel < requiredLevel) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Insufficient permissions.",
          });
        }
      };
    },
  );
}

export default fp(authPlugin, {
  name: "auth",
  fastify: "5.x",
});
