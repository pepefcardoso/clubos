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
    jwtVerify: "refreshVerify",
    jwtSign: "refreshSign",
  } as Parameters<typeof fastifyJwt>[1]);

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
}

export default fp(authPlugin, {
  name: "auth",
  fastify: "5.x",
});
