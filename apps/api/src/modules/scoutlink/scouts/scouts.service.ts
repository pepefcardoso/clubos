import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import type { Redis } from "ioredis";
import {
  issueAccessToken,
  issueRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from "../../../lib/tokens.js";
import { storeRefreshToken, revokeRefreshToken } from "../../../lib/redis.js";
import { ConflictError, NotFoundError } from "../../../lib/errors.js";
import {
  checkLoginAttempts,
  recordFailedAttempt,
  clearLoginAttempts,
} from "../../auth/login-attempts.js";
import type { RefreshTokenPayload } from "../../../types/fastify.js";
import type { ScoutRegisterBody } from "./scouts.schema.js";

const BCRYPT_ROUNDS = 12;

/**
 * Constant-time dummy hash for user-not-found path — prevents enumeration
 * via response timing. Generated with: await bcrypt.hash('__dummy__', 12)
 * MUST use BCRYPT_ROUNDS=12 — never decrease.
 */
const DUMMY_HASH =
  "$2b$12$b/Rq/J0iyn90UOGq8nS9Wugev8d7M7QBMqszSuWr77R8pxkq3rCcy";

export interface ScoutAuthUser {
  id: string;
  name: string;
  email: string;
}

export interface ScoutLoginResult {
  accessToken: string;
  scout: ScoutAuthUser;
}

export async function registerScout(
  prisma: PrismaClient,
  body: ScoutRegisterBody,
): Promise<{ id: string }> {
  const existing = await prisma.scoutProfile.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { id: true },
  });
  if (existing) throw new ConflictError("E-mail já cadastrado.");

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

  const { id } = await prisma.scoutProfile.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      password: passwordHash,
      specialization: body.specialization ?? null,
      targetPositions: body.targetPositions,
      targetAgeRanges: body.targetAgeRanges,
      crmNumber: body.crmNumber ?? null,
    },
    select: { id: true },
  });

  return { id };
}

export async function loginScout(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis,
  reply: FastifyReply,
  email: string,
  password: string,
): Promise<ScoutLoginResult> {
  await checkLoginAttempts(redis, email);

  const scout = await prisma.scoutProfile.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, name: true, email: true, password: true },
  });

  const hashToCompare = scout?.password ?? DUMMY_HASH;
  const ok = await bcrypt.compare(password, hashToCompare);

  if (!scout || !ok) {
    await recordFailedAttempt(redis, email);
    throw new ScoutInvalidCredentialsError();
  }

  await clearLoginAttempts(redis, email);

  const accessToken = issueAccessToken(fastify, {
    sub: scout.id,
    clubId: null,
    role: "SCOUT",
  });

  const { token: refreshToken, jti } = issueRefreshToken(fastify, scout.id);
  await storeRefreshToken(redis, jti, scout.id);
  setRefreshTokenCookie(reply, refreshToken);

  return {
    accessToken,
    scout: { id: scout.id, name: scout.name, email: scout.email },
  };
}

export async function refreshScoutTokens(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: Redis,
  reply: FastifyReply,
  refreshPayload: RefreshTokenPayload,
): Promise<{ accessToken: string }> {
  const scout = await prisma.scoutProfile.findUnique({
    where: { id: refreshPayload.sub },
    select: { id: true },
  });
  if (!scout) throw new ScoutNotFoundError();

  const accessToken = issueAccessToken(fastify, {
    sub: scout.id,
    clubId: null,
    role: "SCOUT",
  });

  const { token: newRefreshToken, jti: newJti } = issueRefreshToken(
    fastify,
    scout.id,
  );
  await storeRefreshToken(redis, newJti, scout.id);
  setRefreshTokenCookie(reply, newRefreshToken);

  return { accessToken };
}

export async function logoutScout(
  fastify: FastifyInstance,
  redis: Redis,
  reply: FastifyReply,
  rawToken: string | undefined,
): Promise<void> {
  if (rawToken) {
    try {
      const payload = (
        fastify as FastifyInstance & {
          refresh: { verify: (token: string) => unknown };
        }
      ).refresh.verify(rawToken) as RefreshTokenPayload;
      await revokeRefreshToken(redis, payload.jti);
    } catch {
      // Already expired or invalid — no action needed.
    }
  }
  clearRefreshTokenCookie(reply);
}

import { UnauthorizedError } from "../../../lib/errors.js";

export class ScoutInvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super("Credenciais inválidas.");
  }
}

export class ScoutNotFoundError extends NotFoundError {
  constructor() {
    super("Scout não encontrado.");
  }
}
