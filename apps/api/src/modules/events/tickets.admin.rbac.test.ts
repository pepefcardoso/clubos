import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("./tickets.service.js", () => ({
  cancelTicket: vi.fn().mockResolvedValue(undefined),
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { ticketAdminRoutes } from "./tickets.admin.routes.js";

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
    await scope.register(ticketAdminRoutes, { prefix: "/api/tickets" });
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

describe("RBAC — DELETE /api/tickets/:ticketId", () => {
  const body = { reason: "Compra errada" };

  it("ADMIN → 204", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/tickets/tkt_01",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(204);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/tickets/tkt_01",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/tickets/tkt_01",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
  it("unauthenticated → 401", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/tickets/tkt_01",
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });
});
