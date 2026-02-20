import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import authPlugin from "../plugins/auth.plugin.js";
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "../types/fastify.js";
import {
  issueAccessToken,
  issueRefreshToken,
  setRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE,
} from "../lib/tokens.js";

vi.mock("../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn(),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

import * as redisModule from "../lib/redis.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-32-chars-minimum",
  JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-minimum",
  NODE_ENV: "test",
};

async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  const mockRedis = { get: vi.fn(), set: vi.fn(), del: vi.fn() };
  fastify.decorate("redis", mockRedis as unknown as Redis);

  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value;
  }

  await fastify.register(authPlugin);

  fastify.get(
    "/protected",
    { preHandler: [fastify.verifyAccessToken] },
    async (request) => {
      const user = request.user as unknown as AccessTokenPayload;
      return { userId: user.sub, clubId: user.clubId, role: user.role };
    },
  );

  fastify.post(
    "/refresh-test",
    { preHandler: [fastify.verifyRefreshToken] },
    async (request) => {
      const payload = request.refreshPayload as unknown as RefreshTokenPayload;
      return { userId: payload.sub, jti: payload.jti };
    },
  );

  await fastify.ready();
  return fastify;
}

describe("verifyAccessToken", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
    });
  });

  it("returns 401 for a malformed token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { Authorization: "Bearer this.is.garbage" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 and populates request.user for a valid access token", async () => {
    const token = issueAccessToken(app, {
      sub: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      userId: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });
  });

  it("returns 401 when a refresh token is passed where an access token is expected", async () => {
    const { token } = issueRefreshToken(app, "user-1");

    const res = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("verifyRefreshToken", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.mocked(redisModule.consumeRefreshToken).mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 when the refresh cookie is absent", async () => {
    const res = await app.inject({ method: "POST", url: "/refresh-test" });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/cookie missing/i);
  });

  it("returns 401 when Redis returns null (token already rotated)", async () => {
    vi.mocked(redisModule.consumeRefreshToken).mockResolvedValue(null);

    const { token } = issueRefreshToken(app, "user-2");

    const res = await app.inject({
      method: "POST",
      url: "/refresh-test",
      cookies: { [REFRESH_TOKEN_COOKIE]: token },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/revoked/i);
  });

  it("returns 401 when Redis userId does not match token sub", async () => {
    vi.mocked(redisModule.consumeRefreshToken).mockResolvedValue("other-user");

    const { token } = issueRefreshToken(app, "user-3");

    const res = await app.inject({
      method: "POST",
      url: "/refresh-test",
      cookies: { [REFRESH_TOKEN_COOKIE]: token },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 200 and populates request.refreshPayload for a valid token", async () => {
    vi.mocked(redisModule.consumeRefreshToken).mockResolvedValue("user-4");

    const { token, jti } = issueRefreshToken(app, "user-4");

    const res = await app.inject({
      method: "POST",
      url: "/refresh-test",
      cookies: { [REFRESH_TOKEN_COOKIE]: token },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ userId: "user-4", jti });
  });
});

describe("issueAccessToken / issueRefreshToken", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("access token is verifiable by the app", async () => {
    const token = issueAccessToken(app, {
      sub: "u1",
      clubId: "c1",
      role: "TREASURER",
    });
    const payload = app.jwt.verify<{ sub: string; type: string }>(token);
    expect(payload.sub).toBe("u1");
    expect(payload.type).toBe("access");
  });

  it("refresh token has a unique jti on each call", () => {
    const a = issueRefreshToken(app, "u1");
    const b = issueRefreshToken(app, "u1");
    expect(a.jti).not.toBe(b.jti);
    expect(a.token).not.toBe(b.token);
  });
});

describe("setRefreshTokenCookie", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    app.get("/set-cookie-test", async (_req, reply) => {
      setRefreshTokenCookie(reply, "dummy-refresh-token");
      return { ok: true };
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("sets an httpOnly cookie with the correct name", async () => {
    const res = await app.inject({ method: "GET", url: "/set-cookie-test" });
    const setCookieHeader = res.headers["set-cookie"] as string | string[];
    const cookies = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader ?? ""];

    const refreshCookie = cookies.find((c) =>
      c.startsWith(`${REFRESH_TOKEN_COOKIE}=`),
    );

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Strict/i);
    expect(refreshCookie).toMatch(/Path=\/api\/auth/i);
  });
});
