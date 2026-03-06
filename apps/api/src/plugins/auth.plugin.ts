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

const ROLE_HIERARCHY: Record<string, number> = {
  TREASURER: 1,
  ADMIN: 2,
};

// ---------------------------------------------------------------------------
// Minimal HS256 JWT implementation for refresh tokens using Node.js crypto.
//
// Why not @fastify/jwt with namespace?
//   Registering @fastify/jwt twice in the same Fastify v5 instance (even with
//   different namespaces) is unreliable: the second registration may be silently
//   skipped because the plugin name "@fastify/jwt" is already registered,
//   leaving fastify.refresh undefined at runtime.
//   Using Node.js built-in crypto avoids any plugin-lifecycle issues and keeps
//   the refresh-token path dependency-free.
// ---------------------------------------------------------------------------

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
  // Returns a preHandler that enforces a minimum role level.
  // Usage: preHandler: [fastify.requireRole('ADMIN')]
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
