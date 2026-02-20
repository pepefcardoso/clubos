import type { FastifyInstance } from "fastify";
import { LoginBodySchema } from "./auth.schema.js";
import {
  loginUser,
  refreshTokens,
  logoutUser,
  InvalidCredentialsError,
  UserNotFoundError,
  REFRESH_TOKEN_COOKIE,
} from "./auth.service.js";
import type { RefreshTokenPayload } from "../../types/fastify.js";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const parsed = LoginBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { email, password } = parsed.data;

      try {
        const result = await loginUser(
          fastify,
          fastify.prisma,
          fastify.redis,
          reply,
          email,
          password,
        );

        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Invalid credentials",
          });
        }
        throw err;
      }
    },
  );

  fastify.post(
    "/refresh",
    {
      preHandler: [fastify.verifyRefreshToken],
    },
    async (request, reply) => {
      const refreshPayload =
        request.refreshPayload as unknown as RefreshTokenPayload;

      try {
        const result = await refreshTokens(
          fastify,
          fastify.prisma,
          fastify.redis,
          reply,
          refreshPayload,
        );

        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "User not found",
          });
        }
        throw err;
      }
    },
  );

  fastify.post("/logout", async (request, reply) => {
    const rawToken = request.cookies[REFRESH_TOKEN_COOKIE];

    await logoutUser(fastify, fastify.redis, reply, rawToken);

    return reply.status(204).send();
  });
}
