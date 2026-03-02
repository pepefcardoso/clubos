import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./messages.service.js", () => ({
  listMessages: vi.fn(),
  hasRecentMessage: vi.fn(),
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { messageRoutes } from "./messages.routes.js";
import { listMessages } from "./messages.service.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const ADMIN_USER = {
  sub: "user-admin-001",
  clubId: "club-abc-001",
  role: "ADMIN" as const,
};

const TREASURER_USER = {
  sub: "user-treasurer-001",
  clubId: "club-abc-001",
  role: "TREASURER" as const,
};

const MOCK_RESULT = {
  data: [
    {
      id: "msg-001",
      memberId: "member-001",
      channel: "WHATSAPP" as const,
      template: "charge_reminder_d3",
      status: "SENT" as const,
      sentAt: new Date("2025-03-28T11:00:00.000Z"),
      failReason: null,
      createdAt: new Date("2025-03-28T11:00:00.000Z"),
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value;
  }

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis;
  const mockPrisma = {} as never;

  fastify.decorate("redis", mockRedis);
  fastify.decorate("prisma", mockPrisma);

  await fastify.register(authPlugin);

  await fastify.register(async (scope) => {
    scope.addHook("preHandler", fastify.verifyAccessToken);
    scope.addHook("preHandler", async (request) => {
      request.actorId = (request.user as { sub: string }).sub;
    });
    await scope.register(messageRoutes, { prefix: "/api/messages" });
  });

  await fastify.ready();
  return fastify;
}

describe("GET /api/messages — T-037", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("MR-1: returns 200 with { data, total, page, limit }", async () => {
    vi.mocked(listMessages).mockResolvedValue(MOCK_RESULT);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/messages",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      data: expect.any(Array),
      total: expect.any(Number),
      page: expect.any(Number),
      limit: expect.any(Number),
    });
  });

  it("MR-2: returns 401 without Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/api/messages" });
    expect(res.statusCode).toBe(401);
  });

  it("MR-3: returns 400 for invalid query param (page=abc)", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/messages?page=abc",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
  });

  it("MR-4: TREASURER role receives 200 (read-only access permitted)", async () => {
    vi.mocked(listMessages).mockResolvedValue(MOCK_RESULT);

    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/messages",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("MR-6: passes status filter to service", async () => {
    vi.mocked(listMessages).mockResolvedValue({ ...MOCK_RESULT, data: [] });

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/api/messages?status=SENT",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listMessages).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      expect.objectContaining({ status: "SENT" }),
    );
  });

  it("MR-7: passes pagination params to service", async () => {
    vi.mocked(listMessages).mockResolvedValue({
      data: [],
      total: 50,
      page: 2,
      limit: 5,
    });

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/api/messages?limit=5&page=2",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listMessages).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      expect.objectContaining({ limit: 5, page: 2 }),
    );
  });
});

describe("GET /api/messages/member/:memberId — T-037", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("MR-5: returns 200 scoped to member", async () => {
    vi.mocked(listMessages).mockResolvedValue(MOCK_RESULT);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/messages/member/member-001",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(listMessages).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      expect.objectContaining({ memberId: "member-001" }),
    );
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/messages/member/member-001",
    });
    expect(res.statusCode).toBe(401);
  });
});
