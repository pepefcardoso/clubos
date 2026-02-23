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
import { memberRoutes } from "./members.routes.js";

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

const VALID_PLAN = {
  id: "cjld2cyuq0000t3rmniod1foy",
  name: "Sócio Bronze",
  isActive: true,
};

const INACTIVE_PLAN = {
  id: "cjld2cyuq0001t3rmniod1foz",
  name: "Plano Inativo",
  isActive: false,
};

type MockMember = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string | null;
  status: string;
  joinedAt: Date;
};

function makeMockPrisma(options?: {
  planOverride?: typeof VALID_PLAN | null;
  existingCpf?: string;
}) {
  const createdMember: MockMember = {
    id: "cjld2cyuq0002t3rmniod1foa",
    name: "João Silva",
    cpf: "12345678901",
    phone: "11999990000",
    email: null,
    status: "ACTIVE",
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const memberPlanCreate = vi.fn().mockResolvedValue({});
  const auditLogCreate = vi.fn().mockResolvedValue({});

  return {
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          plan: {
            findUnique: vi
              .fn()
              .mockImplementation(({ where }: { where: { id: string } }) => {
                if (options?.planOverride === null)
                  return Promise.resolve(null);
                if (
                  options?.planOverride &&
                  where.id === options.planOverride.id
                ) {
                  return Promise.resolve(options.planOverride);
                }
                if (where.id === VALID_PLAN.id)
                  return Promise.resolve(VALID_PLAN);
                if (where.id === INACTIVE_PLAN.id)
                  return Promise.resolve(INACTIVE_PLAN);
                return Promise.resolve(null);
              }),
          },
          member: {
            create: vi
              .fn()
              .mockImplementation(({ data }: { data: { cpf: string } }) => {
                if (options?.existingCpf && data.cpf === options.existingCpf) {
                  const err = new Error("Unique constraint failed") as Error & {
                    code: string;
                  };
                  err.code = "P2002";
                  return Promise.reject(err);
                }
                return Promise.resolve({ ...createdMember, ...data });
              }),
          },
          memberPlan: {
            create: memberPlanCreate,
          },
          auditLog: {
            create: auditLogCreate,
          },
        };
        return fn(tx);
      }),
    _memberPlanCreate: memberPlanCreate,
    _auditLogCreate: auditLogCreate,
  };
}

async function buildTestApp(
  prismaOverride?: ReturnType<typeof makeMockPrisma>,
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

  await fastify.register(async (scope) => {
    scope.addHook("preHandler", fastify.verifyAccessToken);
    scope.addHook("preHandler", async (request) => {
      const user = request.user as { sub: string };
      request.actorId = user.sub;
    });
    await scope.register(memberRoutes, { prefix: "/api/members" });
  });

  await fastify.ready();
  return fastify;
}

describe("POST /api/members — T-011", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("returns 201 with member data when body is valid (no planId)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        name: "João Silva",
        cpf: "12345678901",
        phone: "11999990000",
        email: "joao@email.com",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty("id");
    expect(body).toMatchObject({
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
      status: "ACTIVE",
      plans: [],
    });
  });

  it("returns 201 and creates MemberPlan when valid planId is provided", async () => {
    const mockPrisma = makeMockPrisma();
    app = await buildTestApp(mockPrisma);
    const token = issueAccessToken(app, ADMIN_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        name: "João Silva",
        cpf: "12345678901",
        phone: "11999990000",
        planId: VALID_PLAN.id,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockPrisma._memberPlanCreate).toHaveBeenCalledOnce();
  });

  it("returns 400 when CPF has fewer than 11 digits", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "João Silva", cpf: "1234567890", phone: "11999990000" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when CPF has a mask (123.456.789-00)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        name: "João Silva",
        cpf: "123.456.789-00",
        phone: "11999990000",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 409 when CPF already exists in the club", async () => {
    const mockPrisma = makeMockPrisma({ existingCpf: "12345678901" });
    app = await buildTestApp(mockPrisma);
    const token = issueAccessToken(app, ADMIN_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "João Silva", cpf: "12345678901", phone: "11999990000" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      statusCode: 409,
      error: "Conflict",
      message: "Sócio com este CPF já está cadastrado",
    });
  });

  it("returns 201 for the same CPF in a different club (different schema)", async () => {
    const mockPrisma = makeMockPrisma();
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
    fastify.decorate("prisma", mockPrisma as never);
    await fastify.register(authPlugin);
    await fastify.register(async (scope) => {
      scope.addHook("preHandler", fastify.verifyAccessToken);
      scope.addHook("preHandler", async (request) => {
        request.actorId = (request.user as { sub: string }).sub;
      });
      await scope.register(memberRoutes, { prefix: "/api/members" });
    });
    await fastify.ready();
    app = fastify;

    const tokenOtherClub = issueAccessToken(app, {
      sub: "user-other",
      clubId: "club-2",
      role: "ADMIN",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${tokenOtherClub}` },
      payload: { name: "João Silva", cpf: "12345678901", phone: "11999990000" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("returns 404 when planId does not exist", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        name: "João Silva",
        cpf: "12345678901",
        phone: "11999990000",
        planId: "cjld2cyuq0099t3rmniod1fff",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Plano não encontrado ou inativo");
  });

  it("returns 404 when planId refers to an inactive plan", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        name: "João Silva",
        cpf: "12345678901",
        phone: "11999990000",
        planId: INACTIVE_PLAN.id,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Plano não encontrado ou inativo");
  });

  it("returns 401 when no token is provided", async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: { name: "João Silva", cpf: "12345678901", phone: "11999990000" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 201 when TREASURER creates a member", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, TREASURER_USER);

    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        name: "Maria Souza",
        cpf: "98765432100",
        phone: "21988881111",
      },
    });

    expect(res.statusCode).toBe(201);
  });
});
