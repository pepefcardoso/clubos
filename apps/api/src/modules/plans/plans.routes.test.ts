import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./plans.service.js", () => ({
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
  PlanNotFoundError: class PlanNotFoundError extends Error {
    constructor() {
      super("Plano não encontrado");
      this.name = "PlanNotFoundError";
    }
  },
  DuplicatePlanNameError: class DuplicatePlanNameError extends Error {
    constructor() {
      super("Já existe um plano com este nome");
      this.name = "DuplicatePlanNameError";
    }
  },
  PlanHasActiveMembersError: class PlanHasActiveMembersError extends Error {
    constructor() {
      super("Não é possível excluir um plano com sócios ativos vinculados");
      this.name = "PlanHasActiveMembersError";
    }
  },
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { planRoutes } from "./plans.routes.js";
import {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  PlanNotFoundError,
  DuplicatePlanNameError,
  PlanHasActiveMembersError,
} from "./plans.service.js";

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

const MOCK_PLANS = [
  {
    id: "plan-bronze",
    name: "Bronze",
    priceCents: 1990,
    interval: "monthly",
    benefits: ["Entrada gratuita"],
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  {
    id: "plan-ouro",
    name: "Ouro",
    priceCents: 4990,
    interval: "monthly",
    benefits: ["Entrada gratuita", "Desconto no bar"],
    isActive: true,
    createdAt: new Date("2025-01-02"),
    updatedAt: new Date("2025-01-02"),
  },
];

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
    await scope.register(planRoutes, { prefix: "/api/plans" });
  });

  await fastify.ready();
  return fastify;
}

describe("GET /api/plans", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("PR-1: returns 200 with array of plans for ADMIN", async () => {
    vi.mocked(listPlans).mockResolvedValue(MOCK_PLANS as never);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      priceCents: expect.any(Number),
    });
  });

  it("PR-2: returns 200 for TREASURER (read access is permitted)", async () => {
    vi.mocked(listPlans).mockResolvedValue(MOCK_PLANS as never);

    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 401 when no Authorization header is provided", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plans" });
    expect(res.statusCode).toBe(401);
  });

  it("passes activeOnly=false to listPlans by default", async () => {
    vi.mocked(listPlans).mockResolvedValue(MOCK_PLANS as never);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(listPlans).toHaveBeenCalledWith(expect.anything(), "club-abc-001", {
      activeOnly: false,
    });
  });

  it("passes activeOnly=true when ?activeOnly=true is provided", async () => {
    vi.mocked(listPlans).mockResolvedValue([MOCK_PLANS[0]] as never);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/plans?activeOnly=true",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(listPlans).toHaveBeenCalledWith(expect.anything(), "club-abc-001", {
      activeOnly: true,
    });
  });

  it("returns empty array when club has no plans", async () => {
    vi.mocked(listPlans).mockResolvedValue([]);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe("POST /api/plans", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  const VALID_PAYLOAD = {
    name: "Sócio Prata",
    priceCents: 2990,
    interval: "monthly",
    benefits: ["Entrada gratuita"],
  };

  it("PR-3: returns 201 with created plan for ADMIN", async () => {
    const createdPlan = {
      ...MOCK_PLANS[0],
      id: "plan-new",
      name: VALID_PAYLOAD.name,
      priceCents: VALID_PAYLOAD.priceCents,
    };
    vi.mocked(createPlan).mockResolvedValue(createdPlan as never);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: VALID_PAYLOAD.name });
  });

  it("PR-4: returns 403 for TREASURER (write is ADMIN-only)", async () => {
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });

    expect(res.statusCode).toBe(403);
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("PR-5: returns 400 when name is missing", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: { priceCents: 1990, interval: "monthly" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("returns 400 when priceCents is a float", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ...VALID_PAYLOAD, priceCents: 19.9 },
    });

    expect(res.statusCode).toBe(400);
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("returns 400 when priceCents is zero or negative", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ...VALID_PAYLOAD, priceCents: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("PR-6: returns 409 when plan name already exists", async () => {
    vi.mocked(createPlan).mockRejectedValue(new DuplicatePlanNameError());

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ statusCode: 409, error: "Conflict" });
  });

  it("calls createPlan with correct clubId and actorId from JWT", async () => {
    vi.mocked(createPlan).mockResolvedValue(MOCK_PLANS[0] as never);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });

    expect(createPlan).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      "user-admin-001",
      expect.objectContaining({ name: VALID_PAYLOAD.name }),
    );
  });

  it("defaults interval to monthly when omitted", async () => {
    vi.mocked(createPlan).mockResolvedValue(MOCK_PLANS[0] as never);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "Novo Plano", priceCents: 1990 },
    });

    expect(createPlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ interval: "monthly" }),
    );
  });
});

describe("PUT /api/plans/:planId", () => {
  let app: FastifyInstance;
  const PLAN_ID = "plan-bronze";

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("PR-7: returns 200 with updated plan for ADMIN", async () => {
    const updated = { ...MOCK_PLANS[0], priceCents: 2490 };
    vi.mocked(updatePlan).mockResolvedValue(updated as never);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { priceCents: 2490 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ priceCents: 2490 });
  });

  it("PR-8: returns 403 for TREASURER", async () => {
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { priceCents: 2490 },
    });

    expect(res.statusCode).toBe(403);
    expect(updatePlan).not.toHaveBeenCalled();
  });

  it("returns 404 when plan does not exist", async () => {
    vi.mocked(updatePlan).mockRejectedValue(new PlanNotFoundError());

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/plans/nonexistent",
      headers: { Authorization: `Bearer ${token}` },
      payload: { priceCents: 2490 },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("returns 409 when renaming to a name that already exists", async () => {
    vi.mocked(updatePlan).mockRejectedValue(new DuplicatePlanNameError());

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "Ouro" },
    });

    expect(res.statusCode).toBe(409);
  });

  it("returns 400 when body fails validation (priceCents is float)", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { priceCents: 24.9 },
    });

    expect(res.statusCode).toBe(400);
    expect(updatePlan).not.toHaveBeenCalled();
  });

  it("calls updatePlan with correct planId, clubId, and actorId", async () => {
    vi.mocked(updatePlan).mockResolvedValue(MOCK_PLANS[0] as never);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { priceCents: 2490 },
    });

    expect(updatePlan).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      "user-admin-001",
      PLAN_ID,
      { priceCents: 2490 },
    );
  });

  it("allows partial update with only isActive field", async () => {
    const deactivated = { ...MOCK_PLANS[0], isActive: false };
    vi.mocked(updatePlan).mockResolvedValue(deactivated as never);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: { isActive: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ isActive: false });
  });
});

describe("DELETE /api/plans/:planId", () => {
  let app: FastifyInstance;
  const PLAN_ID = "plan-bronze";

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("PR-9: returns 204 for ADMIN with valid planId", async () => {
    vi.mocked(deletePlan).mockResolvedValue(undefined);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
    expect(deletePlan).toHaveBeenCalledOnce();
  });

  it("PR-10: returns 403 for TREASURER", async () => {
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(deletePlan).not.toHaveBeenCalled();
  });

  it("returns 404 when plan does not exist", async () => {
    vi.mocked(deletePlan).mockRejectedValue(new PlanNotFoundError());

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/plans/nonexistent",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("PR-11: returns 409 when plan has active members", async () => {
    vi.mocked(deletePlan).mockRejectedValue(new PlanHasActiveMembersError());

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ statusCode: 409, error: "Conflict" });
  });

  it("passes clubId and actorId from JWT to deletePlan", async () => {
    vi.mocked(deletePlan).mockResolvedValue(undefined);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "DELETE",
      url: `/api/plans/${PLAN_ID}`,
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(deletePlan).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      "user-admin-001",
      PLAN_ID,
    );
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/plans/${PLAN_ID}`,
    });

    expect(res.statusCode).toBe(401);
    expect(deletePlan).not.toHaveBeenCalled();
  });
});
