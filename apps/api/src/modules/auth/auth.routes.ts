import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { LoginBodySchema } from "./auth.schema.js";
import {
  loginUser,
  refreshTokens,
  logoutUser,
  InvalidCredentialsError,
  UserNotFoundError,
  REFRESH_TOKEN_COOKIE,
} from "./auth.service.js";
import {
  checkLoginAttempts,
  recordFailedAttempt,
  clearLoginAttempts,
  isLockoutThreshold,
} from "./login-attempts.js";
import { withTenantSchema } from "../../lib/prisma.js";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "../../types/fastify.js";

/**
 * Dummy bcrypt hash used for the constant-time compare when the e-mail does
 * not exist in the database. This prevents user enumeration via response
 * timing — bcrypt.compare() returns in the same time whether the hash is
 * real or this dummy value (both are valid $2b$12$ hashes of the correct
 * length so bcrypt does NOT short-circuit).
 *
 * Generated once with: await bcrypt.hash('__dummy__', 12)
 * NEVER change the cost factor without regenerating this constant.
 */
const DUMMY_HASH =
  "$2b$12$b/Rq/J0iyn90UOGq8nS9Wugev8d7M7QBMqszSuWr77R8pxkq3rCcy";

/**
 * The uniform error message returned for every credential failure —
 * wrong password, unknown e-mail, and locked account all return this
 * identical string so callers cannot enumerate valid addresses.
 */
const INVALID_CREDENTIALS_MESSAGE = "Credenciais inválidas.";

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
      const { prisma, redis } = fastify;

      try {
        await checkLoginAttempts(redis, email);
      } catch {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: INVALID_CREDENTIALS_MESSAGE,
        });
      }

      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          email: true,
          password: true,
          clubId: true,
          role: true,
        },
      });

      if (!user) {
        await bcrypt.compare(password, DUMMY_HASH);
        await recordFailedAttempt(redis, email);
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: INVALID_CREDENTIALS_MESSAGE,
        });
      }

      const passwordOk = await bcrypt.compare(password, user.password);
      if (!passwordOk) {
        const count = await recordFailedAttempt(redis, email);

        const auditAction = isLockoutThreshold(count)
          ? ("LOGIN_LOCKED" as const)
          : ("LOGIN_FAILED" as const);

        try {
          await withTenantSchema(prisma, user.clubId, async (tx) => {
            await tx.auditLog.create({
              data: {
                actorId: user.id,
                action: auditAction,
                entityType: "User",
                entityId: user.id,
                metadata: { email, attemptCount: count },
              },
            });
          });
        } catch {
          fastify.log.error(
            { action: auditAction, userId: user.id },
            "[auth] Failed to write audit log entry for failed login",
          );
        }

        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: INVALID_CREDENTIALS_MESSAGE,
        });
      }

      await clearLoginAttempts(redis, email);

      try {
        await withTenantSchema(prisma, user.clubId, async (tx) => {
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "LOGIN_SUCCESS" as const,
              entityType: "User",
              entityId: user.id,
              metadata: { email },
            },
          });
        });
      } catch {
        fastify.log.error(
          { userId: user.id },
          "[auth] Failed to write audit log entry for successful login",
        );
      }

      try {
        const result = await loginUser(
          fastify,
          prisma,
          redis,
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
            message: INVALID_CREDENTIALS_MESSAGE,
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

  fastify.get(
    "/me",
    {
      preHandler: [fastify.verifyAccessToken],
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;

      return reply.status(200).send({
        id: user.sub,
        clubId: user.clubId,
        role: user.role,
      });
    },
  );
}
