import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

import * as redisModule from "../../lib/redis.js";
import authPlugin from "../../plugins/auth.plugin.js";
import { authRoutes } from "./auth.routes.js";
import { REFRESH_TOKEN_COOKIE } from "../../lib/tokens.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const HASHED_PASSWORD = await bcrypt.hash("password123", 10);

const MOCK_USER = {
  id: "user-1",
  email: "admin@clube.com",
  password: HASHED_PASSWORD,
  role: "ADMIN" as const,
  clubId: "club-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeMockPrisma(userOverride?: Partial<typeof MOCK_USER> | null) {
  return {
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          userOverride === null ? null : { ...MOCK_USER, ...userOverride },
        ),
    },
  };
}

function makeMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn(),
  } as unknown as Redis;
}

async function buildTestApp(
  prismaOverride?: ReturnType<typeof makeMockPrisma> | null,
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value;
  }

  const mockRedis = makeMockRedis();
  fastify.decorate("redis", mockRedis);
  fastify.decorate("prisma", (prismaOverride ?? makeMockPrisma()) as never);

  await fastify.register(authPlugin);
  await fastify.register(authRoutes, { prefix: "/api/auth" });
  await fastify.ready();

  return fastify;
}

describe("POST /api/auth/login", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.mocked(redisModule.storeRefreshToken).mockResolvedValue(undefined);
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 400 when body is missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when email format is invalid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "not-an-email", password: "password123" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Bad Request");
  });

  it("returns 400 when password is shorter than 8 chars", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 with generic message when email does not exist", async () => {
    app = await buildTestApp(makeMockPrisma(null));

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@clube.com", password: "password123" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Invalid credentials");
  });

  it("returns 401 with the SAME generic message when password is wrong", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "wrongpassword" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Invalid credentials");
  });

  it("returns 200 with accessToken and user when credentials are valid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("accessToken");
    expect(body.user).toMatchObject({
      id: "user-1",
      email: "admin@clube.com",
      role: "ADMIN",
      clubId: "club-1",
    });
  });

  it("sets an httpOnly, SameSite=Strict, Path=/api/auth cookie on success", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });

    expect(res.statusCode).toBe(200);

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

  it("stores the refresh token JTI in Redis on success", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });

    expect(redisModule.storeRefreshToken).toHaveBeenCalledOnce();
    const [, , userId] = vi.mocked(redisModule.storeRefreshToken).mock
      .calls[0]!;
    expect(userId).toBe("user-1");
  });
});

describe("POST /api/auth/refresh", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.mocked(redisModule.storeRefreshToken).mockResolvedValue(undefined);
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 401 when refresh cookie is absent", async () => {
    vi.mocked(redisModule.consumeRefreshToken).mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().message).toMatch(/cookie missing/i);
  });

  it("returns 200 with new accessToken and rotates the cookie", async () => {
    vi.mocked(redisModule.consumeRefreshToken).mockResolvedValue("user-1");

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });
    expect(loginRes.statusCode).toBe(200);

    const loginCookies = loginRes.cookies;
    const refreshCookieValue = loginCookies.find(
      (c) => c.name === REFRESH_TOKEN_COOKIE,
    )?.value;
    expect(refreshCookieValue).toBeDefined();

    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_TOKEN_COOKIE]: refreshCookieValue! },
    });

    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(body).toHaveProperty("accessToken");

    const refreshSetCookie = refreshRes.headers["set-cookie"] as
      | string
      | string[];
    const cookieArr = Array.isArray(refreshSetCookie)
      ? refreshSetCookie
      : [refreshSetCookie ?? ""];
    expect(
      cookieArr.some((c) => c.startsWith(`${REFRESH_TOKEN_COOKIE}=`)),
    ).toBe(true);
  });

  it("returns 401 when the same refresh token is reused (single-use)", async () => {
    vi.mocked(redisModule.consumeRefreshToken)
      .mockResolvedValueOnce("user-1")
      .mockResolvedValueOnce(null);

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });
    const tokenValue = loginRes.cookies.find(
      (c) => c.name === REFRESH_TOKEN_COOKIE,
    )?.value!;

    await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_TOKEN_COOKIE]: tokenValue },
    });

    const secondRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_TOKEN_COOKIE]: tokenValue },
    });

    expect(secondRes.statusCode).toBe(401);
    expect(secondRes.json().message).toMatch(/revoked/i);
  });

  it("returns 401 when user has been deleted after token was issued", async () => {
    vi.mocked(redisModule.consumeRefreshToken).mockResolvedValue("user-1");

    const appNoUser = await buildTestApp(makeMockPrisma(null));

    const loginApp = await buildTestApp();
    const loginRes = await loginApp.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });
    await loginApp.close();

    const tokenValue = loginRes.cookies.find(
      (c) => c.name === REFRESH_TOKEN_COOKIE,
    )?.value!;

    const res = await appNoUser.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_TOKEN_COOKIE]: tokenValue },
    });

    expect(res.statusCode).toBe(401);
    await appNoUser.close();
  });
});

describe("POST /api/auth/logout", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.mocked(redisModule.storeRefreshToken).mockResolvedValue(undefined);
    vi.mocked(redisModule.revokeRefreshToken).mockResolvedValue(undefined);
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 204 even when no cookie is present", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });

    expect(res.statusCode).toBe(204);
  });

  it("clears the refresh_token cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [REFRESH_TOKEN_COOKIE]: "some-token" },
    });

    expect(res.statusCode).toBe(204);
    const setCookieHeader = res.headers["set-cookie"] as string | string[];
    const cookieArr = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader ?? ""];

    const cleared = cookieArr.find((c) =>
      c.startsWith(`${REFRESH_TOKEN_COOKIE}=`),
    );
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it("revokes the JTI in Redis when a valid token is present", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });
    const tokenValue = loginRes.cookies.find(
      (c) => c.name === REFRESH_TOKEN_COOKIE,
    )?.value!;

    await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [REFRESH_TOKEN_COOKIE]: tokenValue },
    });

    expect(redisModule.revokeRefreshToken).toHaveBeenCalledOnce();
  });

  it("returns 204 and does NOT throw when token is expired/invalid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [REFRESH_TOKEN_COOKIE]: "this.is.garbage" },
    });

    expect(res.statusCode).toBe(204);
    expect(redisModule.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it("after logout, using the old refresh token returns 401", async () => {
    vi.mocked(redisModule.consumeRefreshToken).mockResolvedValue(null);

    const loginRes = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@clube.com", password: "password123" },
    });
    const tokenValue = loginRes.cookies.find(
      (c) => c.name === REFRESH_TOKEN_COOKIE,
    )?.value!;

    await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [REFRESH_TOKEN_COOKIE]: tokenValue },
    });

    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_TOKEN_COOKIE]: tokenValue },
    });

    expect(refreshRes.statusCode).toBe(401);
    expect(refreshRes.json().message).toMatch(/revoked/i);
  });
});
