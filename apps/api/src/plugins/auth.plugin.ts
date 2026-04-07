import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "../types/fastify.js";
import { REFRESH_TOKEN_COOKIE } from "../lib/tokens.js";
import { consumeRefreshToken } from "../lib/redis.js";

/**
 * Numeric levels for the linear financial-access hierarchy.
 *
 * PHYSIO is assigned level 0: it sits BELOW TREASURER in financial routes,
 * so existing requireRole('TREASURER') guards automatically block PHYSIO
 * without any change to those call sites.
 *
 * For FisioBase medical routes, use the OR-allowlist form:
 *   requireRole('ADMIN', 'PHYSIO')
 *
 * Access matrix:
 *   requireRole('ADMIN')           → ADMIN only
 *   requireRole('TREASURER')       → TREASURER or ADMIN (hierarchy)
 *   requireRole('ADMIN', 'PHYSIO') → ADMIN or PHYSIO (OR-allowlist, not TREASURER)
 */
const ROLE_HIERARCHY: Record<string, number> = {
  PHYSIO: 0,
  TREASURER: 1,
  ADMIN: 2,
};

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(str: string): Buffer {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export interface RefreshJwt {
  sign(payload: object, options?: object): string;
  verify<T>(token: string): T;
}

function createRefreshJwt(secret: string): RefreshJwt {
  return {
    sign(payload: object, _options?: object): string {
      const header = b64url(
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
      );
      const now = Math.floor(Date.now() / 1000);
      const body = b64url(
        Buffer.from(
          JSON.stringify({
            iat: now,
            exp: now + REFRESH_TOKEN_TTL_SECONDS,
            ...payload,
          }),
        ),
      );
      const input = `${header}.${body}`;
      const sig = b64url(createHmac("sha256", secret).update(input).digest());
      return `${input}.${sig}`;
    },

    verify<T>(token: string): T {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Invalid JWT format");
      const [h, p, s] = parts as [string, string, string];
      const input = `${h}.${p}`;
      const expectedSig = b64url(
        createHmac("sha256", secret).update(input).digest(),
      );
      const sBuf = Buffer.from(s);
      const eBuf = Buffer.from(expectedSig);
      if (sBuf.length !== eBuf.length || !timingSafeEqual(sBuf, eBuf)) {
        throw new Error("Invalid signature");
      }
      const decoded = JSON.parse(fromB64url(p).toString("utf8")) as T & {
        exp?: number;
      };
      if (
        decoded.exp !== undefined &&
        decoded.exp < Math.floor(Date.now() / 1000)
      ) {
        throw new Error("Token expired");
      }
      return decoded;
    },
  };
}

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

  const refreshJwt = createRefreshJwt(jwtRefreshSecret);
  fastify.decorate("refresh", refreshJwt);

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
        payload = fastify.refresh.verify<RefreshTokenPayload>(rawToken);
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
          message: "Invalid or expired refresh token.",
        });
      }

      request.refreshPayload = payload;
    },
  );

  // ---------------------------------------------------------------------------
  // requireRole
  //
  // Accepts a variadic list of allowed roles.
  //
  // Single-role form (backward-compatible):
  //   requireRole('ADMIN')     → ADMIN only
  //   requireRole('TREASURER') → TREASURER or ADMIN (linear hierarchy)
  //
  // Multi-role OR-allowlist form (used for FisioBase routes):
  //   requireRole('ADMIN', 'PHYSIO') → ADMIN or PHYSIO (not TREASURER)
  //
  // PHYSIO has hierarchy level 0, which is below TREASURER(1) and ADMIN(2),
  // so single-role guards on financial routes automatically block PHYSIO
  // with no change required at those call sites.
  // ---------------------------------------------------------------------------
  fastify.decorate(
    "requireRole",
    function (
      ...allowedRoles: Array<"ADMIN" | "TREASURER" | "PHYSIO">
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

        let permitted: boolean;

        if (allowedRoles.length === 1) {
          const userLevel = ROLE_HIERARCHY[user.role] ?? -1;
          const requiredLevel = ROLE_HIERARCHY[allowedRoles[0]!] ?? 99;
          permitted = userLevel >= requiredLevel;
        } else {
          permitted = (allowedRoles as string[]).includes(user.role);
        }

        if (!permitted) {
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
