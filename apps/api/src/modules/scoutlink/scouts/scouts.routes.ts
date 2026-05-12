import type { FastifyInstance } from "fastify";
import {
  ScoutRegisterBodySchema,
  ScoutLoginBodySchema,
} from "./scouts.schema.js";
import {
  registerScout,
  loginScout,
  refreshScoutTokens,
  logoutScout,
  ScoutInvalidCredentialsError,
  ScoutNotFoundError,
} from "./scouts.service.js";
import { REFRESH_TOKEN_COOKIE } from "../../../lib/tokens.js";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "../../../types/fastify.js";
import { ConflictError } from "../../../lib/errors.js";

const INVALID_CREDENTIALS_MESSAGE = "Credenciais inválidas.";

export async function scoutAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const { prisma, redis } = fastify;

  fastify.post("/register", async (request, reply) => {
    const parsed = ScoutRegisterBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    try {
      const result = await registerScout(prisma, parsed.data);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof ConflictError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: err.message,
        });
      }
      throw err;
    }
  });

  fastify.post("/login", async (request, reply) => {
    const parsed = ScoutLoginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const { email, password } = parsed.data;

    try {
      const result = await loginScout(
        fastify,
        prisma,
        redis,
        reply,
        email,
        password,
      );
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof ScoutInvalidCredentialsError) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: INVALID_CREDENTIALS_MESSAGE,
        });
      }
      throw err;
    }
  });

  fastify.post(
    "/refresh",
    { preHandler: [fastify.verifyRefreshToken] },
    async (request, reply) => {
      const refreshPayload =
        request.refreshPayload as unknown as RefreshTokenPayload;

      try {
        const result = await refreshScoutTokens(
          fastify,
          prisma,
          redis,
          reply,
          refreshPayload,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof ScoutNotFoundError) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Scout não encontrado.",
          });
        }
        throw err;
      }
    },
  );

  fastify.post("/logout", async (request, reply) => {
    const rawToken = request.cookies[REFRESH_TOKEN_COOKIE];
    await logoutScout(fastify, redis, reply, rawToken);
    return reply.status(204).send();
  });

  fastify.get(
    "/me",
    { preHandler: [fastify.verifyAccessToken, fastify.requireRole("SCOUT")] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;

      const scout = await prisma.scoutProfile.findUnique({
        where: { id: user.sub },
        select: {
          id: true,
          name: true,
          email: true,
          subscriptionStatus: true,
          specialization: true,
          targetPositions: true,
          targetAgeRanges: true,
          crmNumber: true,
        },
      });

      if (!scout) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Scout não encontrado.",
        });
      }

      return reply.status(200).send({ ...scout, role: "SCOUT" });
    },
  );
}
