import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { authRoutes } from "./auth.routes.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const MOCK_USER = {
  id: "user-1",
  email: "admin@clube.com",
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

async function buildTestApp(
  prismaOverride?: ReturnType<typeof makeMockPrisma> | null,
  options: { autoReady?: boolean } = { autoReady: true },
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value;
  }

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis;
  fastify.decorate("redis", mockRedis);
  fastify.decorate("prisma", (prismaOverride ?? makeMockPrisma()) as never);

  await fastify.register(authPlugin);
  await fastify.register(authRoutes, { prefix: "/api/auth" });

  fastify.get(
    "/admin-only",
    {
      preHandler: [fastify.verifyAccessToken, fastify.requireRole("ADMIN")],
    },
    async () => ({ ok: true }),
  );

  fastify.get(
    "/treasurer-or-above",
    {
      preHandler: [fastify.verifyAccessToken, fastify.requireRole("TREASURER")],
    },
    async () => ({ ok: true }),
  );

  fastify.get(
    "/medical-only",
    {
      preHandler: [
        fastify.verifyAccessToken,
        fastify.requireRole("ADMIN", "PHYSIO"),
      ],
    },
    async () => ({ ok: true }),
  );

  fastify.register(async (protectedScope) => {
    protectedScope.addHook("preHandler", fastify.verifyAccessToken);
    protectedScope.addHook("preHandler", async (request) => {
      const { sub } =
        request.user as import("../../types/fastify.js").AccessTokenPayload;
      (request as typeof request & { actorId: string }).actorId = sub;
    });

    protectedScope.delete(
      "/api/members/:id",
      { preHandler: [fastify.requireRole("ADMIN")] },
      async (request) => {
        const actorId = (request as typeof request & { actorId: string })
          .actorId;
        return { deleted: (request.params as { id: string }).id, actorId };
      },
    );
  });

  if (options.autoReady !== false) {
    await fastify.ready();
  }

  const fastifyMock = fastify as unknown as Record<string, any>;
  if (!fastifyMock["refresh"]) {
    fastifyMock["refresh"] = {
      sign: (payload: any) =>
        `mock.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`,
      verify: (token: string) => {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid token format");
        return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
      },
    };
  }

  return fastify;
}

describe("requireRole('ADMIN')", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 200 when the authenticated user is ADMIN", async () => {
    const token = issueAccessToken(app, {
      sub: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("returns 403 when the authenticated user is TREASURER", async () => {
    const token = issueAccessToken(app, {
      sub: "user-2",
      clubId: "club-1",
      role: "TREASURER",
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      statusCode: 403,
      error: "Forbidden",
      message: "Insufficient permissions.",
    });
  });

  it("returns 401 when no token is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/admin-only" });
    expect(res.statusCode).toBe(401);
  });
});

describe("requireRole('TREASURER')", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 200 for TREASURER role", async () => {
    const token = issueAccessToken(app, {
      sub: "user-3",
      clubId: "club-1",
      role: "TREASURER",
    });

    const res = await app.inject({
      method: "GET",
      url: "/treasurer-or-above",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 200 for ADMIN role (ADMIN satisfies TREASURER requirement)", async () => {
    const token = issueAccessToken(app, {
      sub: "user-4",
      clubId: "club-1",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/treasurer-or-above",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("requireRole on a real-shaped route (DELETE /api/members/:id)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 403 when TREASURER tries to delete a member (ADMIN-only route)", async () => {
    const token = issueAccessToken(app, {
      sub: "treasurer-1",
      clubId: "club-1",
      role: "TREASURER",
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/members/member-abc",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      statusCode: 403,
      error: "Forbidden",
      message: "Insufficient permissions.",
    });
  });

  it("returns 200 and includes actorId when ADMIN deletes a member", async () => {
    const token = issueAccessToken(app, {
      sub: "admin-1",
      clubId: "club-1",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/members/member-abc",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      deleted: "member-abc",
      actorId: "admin-1",
    });
  });

  it("returns 401 when no token is provided on a protected destructive route", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/members/member-abc",
    });

    expect(res.statusCode).toBe(401);
  });
});

describe("requireRole with unknown/invalid role in token", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 403 when token carries an unknown role value", async () => {
    const token = issueAccessToken(app, {
      sub: "user-x",
      clubId: "club-1",
      role: "SUPERADMIN" as "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/treasurer-or-above",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for empty-string role (fallback to level -1)", async () => {
    const token = issueAccessToken(app, {
      sub: "user-y",
      clubId: "club-1",
      role: "" as "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("requireRole with PHYSIO role — OR-allowlist form ('ADMIN', 'PHYSIO')", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 200 for PHYSIO role on a PHYSIO-allowed route", async () => {
    const token = issueAccessToken(app, {
      sub: "physio-1",
      clubId: "club-1",
      role: "PHYSIO",
    });

    const res = await app.inject({
      method: "GET",
      url: "/medical-only",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("returns 200 for ADMIN role on a PHYSIO-allowed route", async () => {
    const token = issueAccessToken(app, {
      sub: "admin-2",
      clubId: "club-1",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/medical-only",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 403 for TREASURER role on a PHYSIO-allowed route", async () => {
    const token = issueAccessToken(app, {
      sub: "treasurer-2",
      clubId: "club-1",
      role: "TREASURER",
    });

    const res = await app.inject({
      method: "GET",
      url: "/medical-only",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      statusCode: 403,
      error: "Forbidden",
      message: "Insufficient permissions.",
    });
  });

  it("returns 401 when no token is provided on a medical route", async () => {
    const res = await app.inject({ method: "GET", url: "/medical-only" });
    expect(res.statusCode).toBe(401);
  });
});

describe("PHYSIO role — blocked from financial routes (hierarchy guard)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("PHYSIO is blocked from requireRole('TREASURER') routes (level 0 < 1)", async () => {
    const token = issueAccessToken(app, {
      sub: "physio-2",
      clubId: "club-1",
      role: "PHYSIO",
    });

    const res = await app.inject({
      method: "GET",
      url: "/treasurer-or-above",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({
      statusCode: 403,
      error: "Forbidden",
      message: "Insufficient permissions.",
    });
  });

  it("PHYSIO is blocked from requireRole('ADMIN') routes (level 0 < 2)", async () => {
    const token = issueAccessToken(app, {
      sub: "physio-3",
      clubId: "club-1",
      role: "PHYSIO",
    });

    const res = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it("PHYSIO is blocked from ADMIN-only destructive routes (DELETE /api/members/:id)", async () => {
    const token = issueAccessToken(app, {
      sub: "physio-4",
      clubId: "club-1",
      role: "PHYSIO",
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/members/member-xyz",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("requireRole hierarchy invariants with all three active roles", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  const matrix = [
    ["ADMIN", "/admin-only", 200, "ADMIN → admin-only"],
    ["ADMIN", "/treasurer-or-above", 200, "ADMIN → treasurer-or-above"],
    ["ADMIN", "/medical-only", 200, "ADMIN → medical-only"],
    ["TREASURER", "/admin-only", 403, "TREASURER → admin-only"],
    ["TREASURER", "/treasurer-or-above", 200, "TREASURER → treasurer-or-above"],
    ["TREASURER", "/medical-only", 403, "TREASURER → medical-only"],
    ["PHYSIO", "/admin-only", 403, "PHYSIO → admin-only"],
    ["PHYSIO", "/treasurer-or-above", 403, "PHYSIO → treasurer-or-above"],
    ["PHYSIO", "/medical-only", 200, "PHYSIO → medical-only"],
  ] as const;

  for (const [role, route, expected, description] of matrix) {
    it(`${description} → ${expected}`, async () => {
      const token = issueAccessToken(app, {
        sub: `user-matrix`,
        clubId: "club-1",
        role: role as "ADMIN" | "TREASURER" | "PHYSIO",
      });

      const res = await app.inject({
        method: "GET",
        url: route,
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(expected);
    });
  }
});

describe("GET /api/auth/me", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it("returns 401 when no token is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for a malformed token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { Authorization: "Bearer this.is.garbage" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with id, clubId, role for a valid access token", async () => {
    const token = issueAccessToken(app, {
      sub: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });
  });

  it("returns 200 with role: PHYSIO for a PHYSIO access token", async () => {
    const token = issueAccessToken(app, {
      sub: "physio-me",
      clubId: "club-1",
      role: "PHYSIO",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: "physio-me",
      clubId: "club-1",
      role: "PHYSIO",
    });
  });

  it("returns 401 when a refresh token is used instead of an access token", async () => {
    const { issueRefreshToken } = await import("../../lib/tokens.js");
    const { token } = issueRefreshToken(app, "user-1");

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("does NOT expose password or sensitive fields", async () => {
    const token = issueAccessToken(app, {
      sub: "user-1",
      clubId: "club-1",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = res.json();
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("email");
  });
});

describe("GET /health (public)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp(undefined, { autoReady: false });
    app.get("/health", async () => ({ status: "ok" }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 without any Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});
