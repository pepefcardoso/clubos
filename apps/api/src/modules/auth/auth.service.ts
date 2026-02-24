import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import type { Redis } from "ioredis";
import {
  issueAccessToken,
  issueRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE,
} from "../../lib/tokens.js";
import { storeRefreshToken, revokeRefreshToken } from "../../lib/redis.js";
import type { RefreshTokenPayload } from "../../types/fastify.js";

/**
 * Dummy hash used to perform a constant-time compare when the email is not
 * found. This prevents user-enumeration via response timing.
 */
const DUMMY_HASH =
  "$2b$10$abcdefghijklmnopqrstuvuiT6LYiO4z9ZU2n7xvJh8pGkDgQXxNa";

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "TREASURER";
  clubId: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

export async function loginUser(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis,
  reply: FastifyReply,
  email: string,
  password: string,
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  const hashToCompare = user?.password ?? DUMMY_HASH;
  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordMatch) {
    throw new InvalidCredentialsError();
  }

  const accessToken = issueAccessToken(fastify, {
    sub: user.id,
    clubId: user.clubId,
    role: user.role,
  });

  const { token: refreshToken, jti } = issueRefreshToken(fastify, user.id);

  await storeRefreshToken(redis, jti, user.id);

  setRefreshTokenCookie(reply, refreshToken);

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clubId: user.clubId,
    },
  };
}

export interface RefreshResult {
  accessToken: string;
}

export async function refreshTokens(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis,
  reply: FastifyReply,
  refreshPayload: RefreshTokenPayload,
): Promise<RefreshResult> {
  const user = await prisma.user.findUnique({
    where: { id: refreshPayload.sub },
  });

  if (!user) {
    throw new UserNotFoundError();
  }

  const accessToken = issueAccessToken(fastify, {
    sub: user.id,
    clubId: user.clubId,
    role: user.role,
  });

  const { token: newRefreshToken, jti: newJti } = issueRefreshToken(
    fastify,
    user.id,
  );

  await storeRefreshToken(redis, newJti, user.id);
  setRefreshTokenCookie(reply, newRefreshToken);

  return { accessToken };
}

export async function logoutUser(
  fastify: FastifyInstance,
  redis: Redis,
  reply: FastifyReply,
  rawToken: string | undefined,
): Promise<void> {
  if (rawToken) {
    try {
      const refreshJwt = (
        fastify as FastifyInstance & {
          refresh: { verify: (token: string) => RefreshTokenPayload };
        }
      ).refresh;

      const payload = refreshJwt.verify(rawToken);
      await revokeRefreshToken(redis, payload.jti);
    } catch {
      // Token already expired or invalid — no action needed; it's useless anyway.
    }
  }

  clearRefreshTokenCookie(reply);
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

export { REFRESH_TOKEN_COOKIE };
