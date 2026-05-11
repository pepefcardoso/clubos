import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertClubBelongsToUser: vi.fn().mockResolvedValue(undefined),
  assertPosProductExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./products.service.js", () => ({
  listPosProducts: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  createPosProduct: vi.fn().mockResolvedValue({
    id: "prod_01",
    name: "Água",
    priceCents: 500,
    category: null,
    stock: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  updatePosProduct: vi.fn().mockResolvedValue({ id: "prod_01" }),
  deletePosProduct: vi.fn().mockResolvedValue(undefined),
  PosProductNotFoundError: class extends Error {},
  DuplicatePosProductNameError: class extends Error {},
}));

import authPlugin from "../../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../../lib/tokens.js";
import { posProductRoutes } from "./products.routes.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const ADMIN = { sub: "u1", clubId: "club-1", role: "ADMIN" as const };
const TREASURER = { sub: "u2", clubId: "club-1", role: "TREASURER" as const };
const PHYSIO = { sub: "u3", clubId: "club-1", role: "PHYSIO" as const };

async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;

  fastify.decorate("prisma", {} as never);
  fastify.decorate("redis", {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn(),
  } as unknown as Redis);

  await fastify.register(authPlugin);
  await fastify.register(async (scope) => {
    scope.addHook("preHandler", fastify.verifyAccessToken);
    scope.addHook("preHandler", async (req) => {
      req.actorId = (req.user as { sub: string }).sub;
    });
    await scope.register(posProductRoutes, { prefix: "/api/clubs" });
  });

  await fastify.ready();
  return fastify;
}

let app: FastifyInstance;
const TOKEN_CACHE: Record<string, string> = {};

function token(role: "ADMIN" | "TREASURER" | "PHYSIO"): string {
  const user =
    role === "ADMIN" ? ADMIN : role === "TREASURER" ? TREASURER : PHYSIO;
  if (!TOKEN_CACHE[role]) TOKEN_CACHE[role] = issueAccessToken(app, user);
  return TOKEN_CACHE[role]!;
}

beforeEach(async () => {
  app = await buildTestApp();
});

afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
  for (const k of Object.keys(TOKEN_CACHE)) delete TOKEN_CACHE[k];
});

describe("RBAC — GET /api/clubs/:id/pos-products", () => {
  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clubs/club-1/pos-products",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clubs/club-1/pos-products",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clubs/club-1/pos-products",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
  it("unauthenticated → 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/clubs/club-1/pos-products",
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("RBAC — POST /api/clubs/:id/pos-products", () => {
  const body = { name: "Água", priceCents: 500 };

  it("ADMIN → 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs/club-1/pos-products",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs/club-1/pos-products",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs/club-1/pos-products",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — PUT /api/clubs/:id/pos-products/:productId", () => {
  const body = { name: "Água Mineral" };

  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/clubs/club-1/pos-products/prod_01",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/clubs/club-1/pos-products/prod_01",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/clubs/club-1/pos-products/prod_01",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — DELETE /api/clubs/:id/pos-products/:productId", () => {
  it("ADMIN → 204", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/clubs/club-1/pos-products/prod_01",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(204);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/clubs/club-1/pos-products/prod_01",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/clubs/club-1/pos-products/prod_01",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
