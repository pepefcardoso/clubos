import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./event-management.service.js", () => ({
  createEvent: vi.fn().mockResolvedValue({
    id: "evt_01",
    status: "SCHEDULED",
    sectors: [],
    opponent: "Fla",
    eventDate: new Date(),
    venue: "Arena",
    description: null,
    sponsorName: null,
    sponsorLogoUrl: null,
    sponsorCtaUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  listEvents: vi
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
  getEventById: vi.fn().mockResolvedValue({ id: "evt_01" }),
  updateEvent: vi.fn().mockResolvedValue({ id: "evt_01" }),
  cancelEvent: vi.fn().mockResolvedValue(undefined),
  uploadEventSponsorLogo: vi.fn().mockResolvedValue({
    sponsorLogoUrl: "https://cdn.clubos.com.br/logo.webp",
  }),
}));

vi.mock("./tickets.service.js", () => ({
  purchaseTicket: vi.fn().mockResolvedValue({
    ticketId: "tkt_01",
    status: "PENDING",
    amountCents: 2000,
    fanEmail: "fan@example.com",
    sectorName: "Geral",
    gatewayMeta: {},
  }),
  cancelTicket: vi.fn().mockResolvedValue(undefined),
  getPublicEventDetails: vi
    .fn()
    .mockResolvedValue({ id: "evt_01", sectors: [] }),
}));

vi.mock("./tickets.validate.service.js", () => ({
  validateTicket: vi.fn().mockResolvedValue({
    ticketId: "tkt_01",
    fanName: "João",
    sectorName: "Geral",
    eventId: "evt_01",
    checkedInAt: new Date().toISOString(),
  }),
}));

vi.mock("./reports/reports.service.js", () => ({
  getEventReport: vi.fn().mockResolvedValue({
    eventId: "evt_01",
    totalTicketRevenueCents: 0,
    totalPosSalesCents: 0,
    totalCombinedCents: 0,
    totalCheckIns: 0,
    totalNoShows: 0,
    totalCapacity: 0,
    totalSold: 0,
    overallOccupancyPct: 0,
    integrityHash: "abc",
    generatedAt: new Date().toISOString(),
    sectors: [],
    opponent: "Fla",
    eventDate: new Date().toISOString(),
    venue: "Arena",
    status: "COMPLETED",
  }),
  generateEventReportPdf: vi.fn().mockResolvedValue(Buffer.from("pdf")),
}));

vi.mock("./pos/pos.service.js", () => ({
  createPosCharge: vi.fn().mockResolvedValue({
    saleId: "sale_01",
    amountCents: 1000,
    paymentMethod: "PIX",
    productName: "Refri",
    eventId: "evt_01",
    usedFallback: false,
  }),
}));

vi.mock("./pos/products.service.js", () => ({
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
}));

vi.mock("./fans/fans.service.js", () => ({
  listFans: vi
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
}));

vi.mock("./checklist/checklist.service.js", () => ({
  listChecklist: vi.fn().mockResolvedValue({
    eventId: "evt_01",
    byCategory: {},
    totalItems: 0,
    completedItems: 0,
  }),
  toggleChecklistItem: vi
    .fn()
    .mockResolvedValue({ id: "item_01", completed: true }),
  seedChecklistItems: vi.fn().mockResolvedValue(undefined),
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { eventsRoutes } from "./events.routes.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const ADMIN = {
  sub: "user-admin-001",
  clubId: "club-abc-001",
  role: "ADMIN" as const,
};
const TREASURER = {
  sub: "user-treasurer-001",
  clubId: "club-abc-001",
  role: "TREASURER" as const,
};
const PHYSIO = {
  sub: "user-physio-001",
  clubId: "club-abc-001",
  role: "PHYSIO" as const,
};

async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  for (const [k, v] of Object.entries(TEST_ENV)) process.env[k] = v;

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn(),
  } as unknown as Redis;
  fastify.decorate("redis", mockRedis);
  fastify.decorate("prisma", {} as never);

  await fastify.register(authPlugin);
  await fastify.register(async (scope) => {
    scope.addHook("preHandler", fastify.verifyAccessToken);
    scope.addHook("preHandler", async (req) => {
      req.actorId = (req.user as { sub: string }).sub;
    });
    await scope.register(eventsRoutes, { prefix: "/api/events" });
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

describe("RBAC — GET /api/events", () => {
  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
  it("unauthenticated → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/events" });
    expect(res.statusCode).toBe(401);
  });
});

describe("RBAC — POST /api/events", () => {
  const body = {
    opponent: "Fla",
    eventDate: new Date(Date.now() + 86400_000).toISOString(),
    venue: "Arena",
    sectors: [{ name: "Geral", capacity: 100, priceCents: 2000 }],
  };

  it("ADMIN → 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — GET /api/events/:id", () => {
  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — GET /api/events/:id/report", () => {
  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/report",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/report",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/report",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — POST /api/events/:id/tickets/validate", () => {
  const payload = { qrPayload: "{}" };

  it("ADMIN → processes (may return 400 on invalid QR, not 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/tickets/validate",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload,
    });
    expect(res.statusCode).not.toBe(403);
    expect(res.statusCode).not.toBe(401);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/tickets/validate",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/tickets/validate",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — GET /api/events/:id/pos/sales", () => {
  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/pos/sales",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/pos/sales",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/pos/sales",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — GET /api/events/:id/fans", () => {
  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/fans",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/fans",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/fans",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — PUT /api/events/:id", () => {
  const body = { opponent: "Santos" };

  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — DELETE /api/events/:id", () => {
  it("ADMIN → 204", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(204);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/events/evt_01",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — POST /api/events/:id/sponsor-logo", () => {
  it("ADMIN → processes (not 401/403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/sponsor-logo",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/sponsor-logo",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/sponsor-logo",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — POST /api/events/:id/pos/charge", () => {
  const body = { productName: "Água", amountCents: 500, method: "PIX" };

  it("ADMIN → 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/pos/charge",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
  });
  it("TREASURER → 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/pos/charge",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/events/evt_01/pos/charge",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — GET /api/events/:id/checklist", () => {
  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/checklist",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/checklist",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/events/evt_01/checklist",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("RBAC — PATCH /api/events/:id/checklist/:itemId", () => {
  const body = { completed: true };

  it("ADMIN → 200", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/events/evt_01/checklist/item_01",
      headers: { authorization: `Bearer ${token("ADMIN")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
  });
  it("TREASURER → 403", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/events/evt_01/checklist/item_01",
      headers: { authorization: `Bearer ${token("TREASURER")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
  it("PHYSIO → 403", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/events/evt_01/checklist/item_01",
      headers: { authorization: `Bearer ${token("PHYSIO")}` },
      payload: body,
    });
    expect(res.statusCode).toBe(403);
  });
});
