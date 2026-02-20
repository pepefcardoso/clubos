import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload, RefreshTokenPayload } from "../types/fastify";

export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY = "7d";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

export function issueAccessToken(
  fastify: FastifyInstance,
  payload: Omit<AccessTokenPayload, "type">,
): string {
  return fastify.jwt.sign(
    { ...payload, type: "access" } satisfies AccessTokenPayload,
    { expiresIn: ACCESS_TOKEN_EXPIRY },
  );
}

export function issueRefreshToken(
  fastify: FastifyInstance,
  userId: string,
): { token: string; jti: string } {
  const jti = randomUUID();
  const token = (
    fastify as FastifyInstance & {
      refreshJwt: { sign: (payload: object, options?: object) => string };
    }
  ).refreshJwt.sign(
    { sub: userId, jti, type: "refresh" } satisfies RefreshTokenPayload,
    { expiresIn: REFRESH_TOKEN_EXPIRY },
  );
  return { token, jti };
}

export function setRefreshTokenCookie(
  reply: import("fastify").FastifyReply,
  token: string,
): void {
  reply.setCookie(REFRESH_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearRefreshTokenCookie(
  reply: import("fastify").FastifyReply,
): void {
  reply.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}
