import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./charges.service.js", () => ({
  generateMonthlyCharges: vi.fn(),
  NoActivePlanError: class NoActivePlanError extends Error {
    constructor() {
      super(
        "O clube não possui nenhum plano ativo. Crie ao menos um plano antes de gerar cobranças.",
      );
      this.name = "NoActivePlanError";
    }
  },
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { chargeRoutes } from "./charges.routes.js";
import {
  generateMonthlyCharges,
  NoActivePlanError,
} from "./charges.service.js";

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
  generated: 3,
  skipped: 1,
  errors: [],
  gatewayErrors: [],
  charges: [
    {
      chargeId: "charge-001",
      memberId: "member-001",
      memberName: "Alice Costa",
      amountCents: 9900,
      dueDate: new Date("2025-03-31T23:59:59.999Z"),
      externalId: "pay_abc123",
      gatewayName: "asaas",
      gatewayMeta: {
        qrCodeBase64: "base64string==",
        pixCopyPaste: "00020126580014br.gov.bcb.pix...",
      },
    },
  ],
};

const EMPTY_RESULT = {
  generated: 0,
  skipped: 0,
  errors: [],
  gatewayErrors: [],
  charges: [],
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
    await scope.register(chargeRoutes, { prefix: "/api/charges" });
  });

  await fastify.ready();
  return fastify;
}

describe("POST /api/charges/generate — T-025", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("R-1: returns 200 with ChargeGenerationResult when body contains billingPeriod", async () => {
    vi.mocked(generateMonthlyCharges).mockResolvedValue(MOCK_RESULT);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: { billingPeriod: "2025-03-01T00:00:00.000Z" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      generated: 3,
      skipped: 1,
      errors: [],
      gatewayErrors: [],
    });
    expect(body.charges).toHaveLength(1);
    expect(body.charges[0]).toMatchObject({
      chargeId: "charge-001",
      memberName: "Alice Costa",
      amountCents: 9900,
      externalId: "pay_abc123",
      gatewayName: "asaas",
    });
  });

  it("R-2: returns 200 when body is empty (all fields optional)", async () => {
    vi.mocked(generateMonthlyCharges).mockResolvedValue(MOCK_RESULT);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(generateMonthlyCharges).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      {},
    );
  });

  it("R-3: returns 400 when billingPeriod is not a valid ISO datetime", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: { billingPeriod: "not-a-date" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      statusCode: 400,
      error: "Bad Request",
    });
    expect(generateMonthlyCharges).not.toHaveBeenCalled();
  });

  it("R-4: returns 422 Unprocessable Entity when club has no active plans", async () => {
    vi.mocked(generateMonthlyCharges).mockRejectedValue(
      new NoActivePlanError(),
    );

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      statusCode: 422,
      error: "Unprocessable Entity",
      message:
        "O clube não possui nenhum plano ativo. Crie ao menos um plano antes de gerar cobranças.",
    });
  });

  it("R-5: returns 500 when service throws an unexpected error", async () => {
    vi.mocked(generateMonthlyCharges).mockRejectedValue(
      new Error("Database connection lost"),
    );

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(500);
  });

  it("R-6: returns 401 when no Authorization header is provided", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(generateMonthlyCharges).not.toHaveBeenCalled();
  });

  it("R-7: calls generateMonthlyCharges with the correct clubId and actorId from JWT", async () => {
    vi.mocked(generateMonthlyCharges).mockResolvedValue(MOCK_RESULT);

    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        billingPeriod: "2025-03-01T00:00:00.000Z",
        dueDate: "2025-03-15T00:00:00.000Z",
      },
    });

    expect(generateMonthlyCharges).toHaveBeenCalledOnce();
    expect(generateMonthlyCharges).toHaveBeenCalledWith(
      expect.anything(),
      "club-abc-001",
      "user-admin-001",
      {
        billingPeriod: "2025-03-01T00:00:00.000Z",
        dueDate: "2025-03-15T00:00:00.000Z",
      },
    );
  });

  it("R-8: returns 200 with generated=0 and empty charges[] when no eligible members exist", async () => {
    vi.mocked(generateMonthlyCharges).mockResolvedValue(EMPTY_RESULT);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      generated: 0,
      skipped: 0,
      errors: [],
      gatewayErrors: [],
      charges: [],
    });
  });

  it("TREASURER role can also trigger charge generation (returns 200)", async () => {
    vi.mocked(generateMonthlyCharges).mockResolvedValue(MOCK_RESULT);

    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 200 even when result contains partial errors and gateway errors", async () => {
    const partialResult = {
      generated: 2,
      skipped: 0,
      errors: [{ memberId: "member-bad", reason: "DB write failed" }],
      gatewayErrors: [
        {
          chargeId: "charge-002",
          memberId: "member-gw-fail",
          reason: "Asaas 503",
        },
      ],
      charges: [],
    };
    vi.mocked(generateMonthlyCharges).mockResolvedValue(partialResult);

    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.errors).toHaveLength(1);
    expect(body.gatewayErrors).toHaveLength(1);
  });

  it("returns 400 when dueDate is not a valid ISO datetime", async () => {
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/charges/generate",
      headers: { Authorization: `Bearer ${token}` },
      payload: { dueDate: "31/03/2025" },
    });

    expect(res.statusCode).toBe(400);
    expect(generateMonthlyCharges).not.toHaveBeenCalled();
  });
});
