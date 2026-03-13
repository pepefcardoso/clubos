import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn().mockResolvedValue(null),
  getPrismaClient: vi.fn().mockReturnValue({}),
  isPrismaUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

const mockGetMemberPaymentHistory = vi.fn();
const mockFindMemberInClub = vi.fn();

vi.mock("./members.payments.service.js", () => ({
  getMemberPaymentHistory: (...args: unknown[]) =>
    mockGetMemberPaymentHistory(...args),
  findMemberInClub: (...args: unknown[]) => mockFindMemberInClub(...args),
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { memberPaymentRoutes } from "./members.payments.routes.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const ADMIN_USER = {
  sub: "user-admin",
  clubId: "club-1",
  role: "ADMIN" as const,
};

const TREASURER_USER = {
  sub: "user-treasurer",
  clubId: "club-1",
  role: "TREASURER" as const,
};

const MEMBER_ID = "member-001";

const MOCK_PAYMENT_ITEM = {
  paymentId: "pay001",
  chargeId: "chg001",
  paidAt: new Date("2025-03-01T10:43:00.000Z"),
  method: "PIX",
  amountCents: 9900,
  gatewayTxid: "txid_asaas_001",
  cancelledAt: null,
  cancelReason: null,
  charge: {
    id: "chg001",
    dueDate: new Date("2025-03-05T00:00:00.000Z"),
    status: "PAID",
    method: "PIX",
    amountCents: 9900,
    gatewayName: "asaas",
    createdAt: new Date("2025-03-01T08:00:00.000Z"),
  },
};

const DEFAULT_RESULT = {
  data: [MOCK_PAYMENT_ITEM],
  meta: { total: 1, page: 1, limit: 20 },
};

async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  for (const [key, value] of Object.entries(TEST_ENV)) process.env[key] = value;

  fastify.decorate("redis", {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis);
  fastify.decorate("prisma", {} as never);

  await fastify.register(authPlugin);

  await fastify.register(async (scope) => {
    scope.addHook("preHandler", fastify.verifyAccessToken);
    scope.addHook("preHandler", async (request) => {
      request.actorId = (request.user as { sub: string }).sub;
    });
    await scope.register(memberPaymentRoutes, { prefix: "/api/members" });
  });

  await fastify.ready();
  return fastify;
}

describe("GET /api/members/:id/payments", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMemberInClub.mockResolvedValue({ id: MEMBER_ID });
    mockGetMemberPaymentHistory.mockResolvedValue(DEFAULT_RESULT);
  });

  afterEach(async () => {
    await app?.close();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("401 response has the standard error shape", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
    });
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
    });
  });

  it("returns 200 for ADMIN role", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 for TREASURER role", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns the correct envelope with data and meta", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("meta");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it("payment item has all required fields", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });

    const item = res.json().data[0];
    expect(item).toHaveProperty("paymentId");
    expect(item).toHaveProperty("chargeId");
    expect(item).toHaveProperty("paidAt");
    expect(item).toHaveProperty("method");
    expect(item).toHaveProperty("amountCents");
    expect(item).toHaveProperty("gatewayTxid");
    expect(item).toHaveProperty("cancelledAt");
    expect(item).toHaveProperty("cancelReason");
    expect(item).toHaveProperty("charge");
  });

  it("charge sub-object has all required fields", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });

    const charge = res.json().data[0].charge;
    expect(charge).toHaveProperty("id");
    expect(charge).toHaveProperty("dueDate");
    expect(charge).toHaveProperty("status");
    expect(charge).toHaveProperty("method");
    expect(charge).toHaveProperty("amountCents");
    expect(charge).toHaveProperty("gatewayName");
    expect(charge).toHaveProperty("createdAt");
  });

  it("returns empty data array when member has no payments", async () => {
    mockGetMemberPaymentHistory.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20 },
    });
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  it("returns 404 when member does not exist in the authenticated club", async () => {
    mockFindMemberInClub.mockResolvedValue(null);
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members/nonexistent-id/payments",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Sócio não encontrado.",
    });
  });

  it("returns 404 (not 403) for members from another club — IDOR-safe", async () => {
    mockFindMemberInClub.mockResolvedValue(null);
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members/other-club-member-id/payments",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(mockGetMemberPaymentHistory).not.toHaveBeenCalled();
  });

  it("defaults to page=1 and limit=20 when not specified", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(20);
  });

  it("accepts ?page=2&limit=5 and forwards them to the service", async () => {
    mockGetMemberPaymentHistory.mockResolvedValue({
      data: [],
      meta: { total: 0, page: 2, limit: 5 },
    });
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments?page=2&limit=5`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toMatchObject({ page: 2, limit: 5 });
    expect(mockGetMemberPaymentHistory).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      MEMBER_ID,
      2,
      5,
    );
  });

  it("returns 400 for ?page=abc (non-numeric)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments?page=abc`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
  });

  it("returns 400 for ?page=0 (below minimum of 1)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments?page=0`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for ?limit=200 (above maximum of 100)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments?limit=200`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
  });

  it("returns 400 for ?limit=0 (below minimum of 1)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments?limit=0`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("does not call getMemberPaymentHistory when query params are invalid", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments?page=abc`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mockGetMemberPaymentHistory).not.toHaveBeenCalled();
  });

  it("calls findMemberInClub with correct clubId and memberId", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mockFindMemberInClub).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      MEMBER_ID,
    );
  });

  it("calls getMemberPaymentHistory with correct clubId, memberId, page and limit", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments?page=1&limit=20`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mockGetMemberPaymentHistory).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      MEMBER_ID,
      1,
      20,
    );
  });

  it("uses clubId from the JWT token, not from params", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, TREASURER_USER);
    await app.inject({
      method: "GET",
      url: `/api/members/${MEMBER_ID}/payments`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mockFindMemberInClub).toHaveBeenCalledWith(
      expect.anything(),
      TREASURER_USER.clubId,
      MEMBER_ID,
    );
  });
});
