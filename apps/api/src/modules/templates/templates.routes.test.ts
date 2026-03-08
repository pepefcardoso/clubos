import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./templates.service.js", () => ({
  listTemplates: vi.fn(),
  upsertTemplate: vi.fn(),
  resetTemplate: vi.fn(),
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { templateRoutes } from "./templates.routes.js";
import {
  listTemplates,
  upsertTemplate,
  resetTemplate,
} from "./templates.service.js";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS } from "./templates.constants.js";

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

const CONFIGURABLE_KEYS = [
  TEMPLATE_KEYS.CHARGE_REMINDER_D3,
  TEMPLATE_KEYS.CHARGE_REMINDER_D0,
  TEMPLATE_KEYS.OVERDUE_NOTICE,
] as const;

const MOCK_TEMPLATES = CONFIGURABLE_KEYS.map((key) => ({
  key,
  channel: "WHATSAPP" as const,
  body: DEFAULT_TEMPLATES[key],
  isCustom: false,
}));

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
    await scope.register(templateRoutes, { prefix: "/api/templates" });
  });

  await fastify.ready();
  return fastify;
}

describe("GET /api/templates — T-032", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("TR-1: returns 200 with array of 3 template objects", async () => {
    vi.mocked(listTemplates).mockResolvedValue(MOCK_TEMPLATES);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/templates",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    expect(body[0]).toMatchObject({
      key: expect.any(String),
      body: expect.any(String),
      isCustom: false,
    });
  });

  it("returns 200 for TREASURER (read-only access is permitted)", async () => {
    vi.mocked(listTemplates).mockResolvedValue(MOCK_TEMPLATES);

    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/templates",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/api/templates" });
    expect(res.statusCode).toBe(401);
  });
});

describe("PUT /api/templates/:key — T-032", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("TR-2: returns 200 for ADMIN with valid key and body", async () => {
    vi.mocked(upsertTemplate).mockResolvedValue(undefined);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/templates/charge_reminder_d3",
      headers: { Authorization: `Bearer ${token}` },
      payload: { body: "Novo template válido com mais de dez caracteres." },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
    expect(upsertTemplate).toHaveBeenCalledOnce();
  });

  it("TR-3: returns 403 for TREASURER (write is ADMIN-only)", async () => {
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/templates/charge_reminder_d3",
      headers: { Authorization: `Bearer ${token}` },
      payload: { body: "Novo template válido com mais de dez caracteres." },
    });

    expect(res.statusCode).toBe(403);
    expect(upsertTemplate).not.toHaveBeenCalled();
  });

  it("TR-4: returns 400 when body is too short (< 10 chars)", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/templates/charge_reminder_d3",
      headers: { Authorization: `Bearer ${token}` },
      payload: { body: "curto" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
    expect(upsertTemplate).not.toHaveBeenCalled();
  });

  it("TR-5: returns 400 when :key is not a recognised template key", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/templates/invalid_key_name",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        body: "Template válido com mais de dez caracteres para teste.",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(upsertTemplate).not.toHaveBeenCalled();
  });

  it("calls upsertTemplate with correct clubId and actorId from JWT", async () => {
    vi.mocked(upsertTemplate).mockResolvedValue(undefined);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/api/templates/overdue_notice",
      headers: { Authorization: `Bearer ${token}` },
      payload: { body: "Corpo personalizado de teste para aviso de atraso." },
    });

    expect(upsertTemplate).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      "user-admin-001",
      "overdue_notice",
      "Corpo personalizado de teste para aviso de atraso.",
      "WHATSAPP",
    );
  });

  it("accepts EMAIL channel override", async () => {
    vi.mocked(upsertTemplate).mockResolvedValue(undefined);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/api/templates/charge_reminder_d0",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        body: "Template de e-mail válido com mais de dez caracteres.",
        channel: "EMAIL",
      },
    });

    expect(upsertTemplate).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      "user-admin-001",
      "charge_reminder_d0",
      "Template de e-mail válido com mais de dez caracteres.",
      "EMAIL",
    );
  });

  it("returns 400 when body is missing", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/templates/charge_reminder_d3",
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/templates/:key — T-032", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("TR-6: returns 200 and calls resetTemplate for ADMIN with valid key", async () => {
    vi.mocked(resetTemplate).mockResolvedValue(undefined);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/templates/charge_reminder_d3",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
    expect(resetTemplate).toHaveBeenCalledOnce();
  });

  it("returns 400 when :key is invalid", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/templates/not_a_real_key",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(400);
    expect(resetTemplate).not.toHaveBeenCalled();
  });

  it("returns 403 for TREASURER", async () => {
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/templates/charge_reminder_d3",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(resetTemplate).not.toHaveBeenCalled();
  });

  it("passes clubId and actorId from JWT to resetTemplate", async () => {
    vi.mocked(resetTemplate).mockResolvedValue(undefined);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "DELETE",
      url: "/api/templates/overdue_notice",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(resetTemplate).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      "user-admin-001",
      "overdue_notice",
      "WHATSAPP",
    );
  });
});
