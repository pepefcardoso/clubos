import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../../types/fastify.js";

vi.mock("./reconciliation.service.js", () => ({
  matchOfxTransactions: vi.fn(),
  confirmReconciliationMatch: vi.fn(),
}));

vi.mock("./reconciliation.parser.js", () => ({
  parseOfxFile: vi.fn(),
}));

import { reconciliationRoutes } from "./reconciliation.routes.js";
import {
  matchOfxTransactions,
  confirmReconciliationMatch,
} from "./reconciliation.service.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";

const ADMIN_USER: AccessTokenPayload = {
  sub: "admin-1",
  clubId: "club-1",
  role: "ADMIN",
  type: "access",
};

const TREASURER_USER: AccessTokenPayload = {
  sub: "treasurer-1",
  clubId: "club-1",
  role: "TREASURER",
  type: "access",
};

async function buildApp(
  role: "ADMIN" | "TREASURER" = "ADMIN",
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  fastify.decorate("prisma", {} as never);

  fastify.decorate(
    "verifyAccessToken",
    async (request: import("fastify").FastifyRequest) => {
      request.user = role === "ADMIN" ? ADMIN_USER : TREASURER_USER;
    },
  );

  fastify.decorate(
    "requireRole",
    (minimumRole: "ADMIN" | "TREASURER" | "PHYSIO") =>
      async (
        request: import("fastify").FastifyRequest,
        reply: import("fastify").FastifyReply,
      ) => {
        const hierarchy: Record<string, number> = { TREASURER: 1, ADMIN: 2 };
        const user = request.user as AccessTokenPayload;
        if ((hierarchy[user.role] ?? 0) < (hierarchy[minimumRole] ?? 99)) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Insufficient permissions.",
          });
        }
      },
  );

  fastify.addHook("preHandler", async (request) => {
    const user = request.user as AccessTokenPayload;
    if (user) request.actorId = user.sub;
  });

  await fastify.register(reconciliationRoutes, {
    prefix: "/api/reconciliation",
  });
  await fastify.ready();
  return fastify;
}

const SAMPLE_TRANSACTION = {
  fitId: "FIT001",
  type: "CREDIT",
  postedAt: "2025-01-15T12:00:00.000Z",
  amountCents: 8000,
  description: "PIX RECEBIDO",
};

describe("POST /api/reconciliation/match — success", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("ADMIN");
    vi.mocked(matchOfxTransactions).mockResolvedValue({
      matches: [],
      summary: {
        total: 1,
        matched: 1,
        ambiguous: 0,
        unmatched: 0,
        skippedDebits: 0,
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with match results", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      payload: { transactions: [SAMPLE_TRANSACTION] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("matches");
    expect(body).toHaveProperty("summary");
  });

  it("calls matchOfxTransactions with the clubId from the JWT", async () => {
    await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      payload: { transactions: [SAMPLE_TRANSACTION] },
    });
    expect(matchOfxTransactions).toHaveBeenCalledWith(
      expect.anything(),
      "club-1",
      expect.any(Array),
    );
  });
});

describe("POST /api/reconciliation/match — validation errors", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("ADMIN");
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 400 when transactions array is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      payload: { transactions: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when body is missing transactions field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/reconciliation/match — RBAC", () => {
  it("returns 403 when role is TREASURER", async () => {
    const app = await buildApp("TREASURER");
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/match",
      payload: { transactions: [SAMPLE_TRANSACTION] },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

const VALID_CONFIRM_BODY = {
  fitId: "FIT001",
  chargeId: "charge-1",
  paidAt: "2025-01-15T12:00:00.000Z",
  method: "PIX",
};

describe("POST /api/reconciliation/confirm — success", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("ADMIN");
    vi.mocked(confirmReconciliationMatch).mockResolvedValue({
      paymentId: "pay-1",
      chargeId: "charge-1",
      paidAt: "2025-01-15T12:00:00.000Z",
      amountCents: 8000,
      memberStatusUpdated: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 with payment data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/confirm",
      payload: VALID_CONFIRM_BODY,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.paymentId).toBe("pay-1");
    expect(body.chargeId).toBe("charge-1");
  });

  it("passes actorId from the JWT sub to the service", async () => {
    await app.inject({
      method: "POST",
      url: "/api/reconciliation/confirm",
      payload: VALID_CONFIRM_BODY,
    });
    expect(confirmReconciliationMatch).toHaveBeenCalledWith(
      expect.anything(),
      "club-1",
      "admin-1",
      expect.objectContaining({ fitId: "FIT001" }),
    );
  });
});

describe("POST /api/reconciliation/confirm — error responses", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("ADMIN");
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 409 when charge is already paid", async () => {
    vi.mocked(confirmReconciliationMatch).mockRejectedValue(
      new ConflictError("Cobrança já está paga."),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/confirm",
      payload: VALID_CONFIRM_BODY,
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 404 when chargeId is not found", async () => {
    vi.mocked(confirmReconciliationMatch).mockRejectedValue(
      new NotFoundError("Cobrança não encontrada."),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/confirm",
      payload: VALID_CONFIRM_BODY,
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when paidAt is not a valid ISO datetime", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/confirm",
      payload: { ...VALID_CONFIRM_BODY, paidAt: "15/01/2025" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when chargeId is missing", async () => {
    const body = {
      fitId: VALID_CONFIRM_BODY.fitId,
      paidAt: VALID_CONFIRM_BODY.paidAt,
      method: VALID_CONFIRM_BODY.method,
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/confirm",
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/reconciliation/confirm — RBAC", () => {
  it("returns 403 when role is TREASURER", async () => {
    const app = await buildApp("TREASURER");
    const res = await app.inject({
      method: "POST",
      url: "/api/reconciliation/confirm",
      payload: VALID_CONFIRM_BODY,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
