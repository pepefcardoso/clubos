import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn().mockResolvedValue(null),
}));

vi.mock("../messages/messages.service.js", () => ({
  hasRecentMessage: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../lib/whatsapp-rate-limit.js", () => ({
  checkAndConsumeWhatsAppRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
}));

vi.mock("../templates/templates.service.js", () => ({
  buildRenderedMessage: vi.fn().mockResolvedValue("Mocked message body"),
}));

vi.mock("../whatsapp/whatsapp.service.js", () => ({
  sendWhatsAppMessage: vi
    .fn()
    .mockResolvedValue({ messageId: "msg_1", status: "SENT" }),
}));

vi.mock("../templates/templates.constants.js", () => ({
  TEMPLATE_KEYS: { CHARGE_REMINDER_MANUAL: "charge_reminder_manual" },
}));

const mockListMembers = vi.fn();
const mockGetMemberById = vi.fn();
const mockUpdateMember = vi.fn();
const mockCreateMember = vi.fn();

vi.mock("./members.service.js", () => {
  class DuplicateCpfError extends Error {
    constructor() {
      super("Sócio com este CPF já está cadastrado");
      this.name = "DuplicateCpfError";
    }
  }
  class PlanNotFoundError extends Error {
    constructor() {
      super("Plano não encontrado ou inativo");
      this.name = "PlanNotFoundError";
    }
  }
  class MemberNotFoundError extends Error {
    constructor() {
      super("Sócio não encontrado");
      this.name = "MemberNotFoundError";
    }
  }

  return {
    listMembers: (...args: unknown[]) => mockListMembers(...args),
    getMemberById: (...args: unknown[]) => mockGetMemberById(...args),
    updateMember: (...args: unknown[]) => mockUpdateMember(...args),
    createMember: (...args: unknown[]) => mockCreateMember(...args),
    DuplicateCpfError,
    PlanNotFoundError,
    MemberNotFoundError,
  };
});

vi.mock("./members-import.service.js", () => ({
  importMembersFromCsv: vi.fn().mockResolvedValue({ imported: 0, errors: [] }),
}));

import {
  DuplicateCpfError,
  PlanNotFoundError,
  MemberNotFoundError,
} from "./members.service.js";

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

const MOCK_MEMBER = {
  id: "member-001",
  name: "João Silva",
  cpf: "12345678901",
  phone: "11999990000",
  email: "joao@example.com",
  status: "ACTIVE",
  joinedAt: new Date("2025-01-01T00:00:00.000Z"),
  plans: [],
};

const PAGINATED_RESPONSE = {
  data: [MOCK_MEMBER],
  total: 1,
  page: 1,
  limit: 20,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListMembers.mockResolvedValue(PAGINATED_RESPONSE);
  mockGetMemberById.mockResolvedValue(MOCK_MEMBER);
  mockUpdateMember.mockResolvedValue(MOCK_MEMBER);
  mockCreateMember.mockResolvedValue(MOCK_MEMBER);
});

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
    await scope.register(memberRoutes, { prefix: "/api/members" });
  });
  await fastify.ready();
  return fastify;
}

describe("GET /api/members", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app?.close();
  });

  it("returns 200 with data and pagination fields", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page", 1);
    expect(body).toHaveProperty("limit", 20);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("returns 200 for TREASURER role", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 when no token is provided", async () => {
    app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/members" });
    expect(res.statusCode).toBe(401);
  });

  it("accepts valid page and limit query params", async () => {
    mockListMembers.mockResolvedValue({
      ...PAGINATED_RESPONSE,
      page: 2,
      limit: 10,
    });
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members?page=2&limit=10",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(2);
    expect(body.limit).toBe(10);
  });

  it("returns 400 for limit exceeding 100", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members?limit=101",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for non-positive page number", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members?page=0",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts status filter query param", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members?status=ACTIVE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 400 for invalid status filter", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members?status=UNKNOWN",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts search query param", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members?search=João",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("defaults to page=1 and limit=20 when not specified", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("forwards clubId from token to listMembers", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mockListMembers).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });
});

describe("POST /api/members", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app?.close();
  });

  const VALID_PAYLOAD = {
    name: "Ana Lima",
    cpf: "11122233344",
    phone: "11988887777",
  };

  it("returns 201 with created member on valid input", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toHaveProperty("id");
  });

  it("returns 201 for TREASURER role (no role restriction on create)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 201 with optional email included", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ...VALID_PAYLOAD, email: "ana@clube.com" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 201 with planId included", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ...VALID_PAYLOAD, planId: "cjld2cyuq0000t3rmniod1foy" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 when name is missing", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const { name: _name, ...withoutName } = VALID_PAYLOAD;
    void _name;
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: withoutName,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when cpf is missing", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const { cpf: _cpf, ...withoutCpf } = VALID_PAYLOAD;
    void _cpf;
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: withoutCpf,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when phone is missing", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const { phone: _phone, ...withoutPhone } = VALID_PAYLOAD;
    void _phone;
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: withoutPhone,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 when DuplicateCpfError is thrown", async () => {
    mockCreateMember.mockRejectedValue(new DuplicateCpfError());
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      statusCode: 409,
      error: "Conflict",
      message: "Sócio com este CPF já está cadastrado",
    });
  });

  it("returns 404 when PlanNotFoundError is thrown", async () => {
    mockCreateMember.mockRejectedValue(new PlanNotFoundError());
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: { ...VALID_PAYLOAD, planId: "cjld2cyuq0099t3rmniod1fff" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Plano não encontrado ou inativo",
    });
  });

  it("returns 401 when no token is provided", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/members",
      payload: VALID_PAYLOAD,
    });
    expect(res.statusCode).toBe(401);
  });

  it("calls createMember with correct clubId and actorId", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_PAYLOAD,
    });
    expect(mockCreateMember).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      expect.objectContaining({ name: "Ana Lima" }),
    );
  });

  it("does not call createMember when validation fails", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "POST",
      url: "/api/members",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "X" },
    });
    expect(mockCreateMember).not.toHaveBeenCalled();
  });
});

describe("GET /api/members/:memberId", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app?.close();
  });

  it("returns 200 with member data for a valid memberId", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("cpf");
    expect(body).toHaveProperty("phone");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("plans");
  });

  it("returns 200 for TREASURER role", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 when member does not exist", async () => {
    mockGetMemberById.mockRejectedValue(new MemberNotFoundError());
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/members/nonexistent-id",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Sócio não encontrado",
    });
  });

  it("returns 401 when no token is provided", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/members/member-001",
    });
    expect(res.statusCode).toBe(401);
  });

  it("passes memberId and clubId to getMemberById", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(mockGetMemberById).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      "member-001",
    );
  });
});

describe("PUT /api/members/:memberId", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    await app?.close();
  });

  it("returns 200 with updated member when body is valid (name only)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "João Atualizado" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("id");
  });

  it("returns 200 when updating phone", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { phone: "21988881111" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 when updating email", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { email: "novo@email.com" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 when setting email to null (clearing it)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { email: null },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 when updating status to INACTIVE", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { status: "INACTIVE" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 400 for invalid status value", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { status: "BANNED" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for phone with mask", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { phone: "(11) 99999-0000" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for name shorter than 2 characters", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "J" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when member does not exist", async () => {
    mockUpdateMember.mockRejectedValue(new MemberNotFoundError());
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/nonexistent-id",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "João" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Sócio não encontrado",
    });
  });

  it("returns 403 when TREASURER tries to update a member", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "Nome Novo" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ statusCode: 403, error: "Forbidden" });
  });

  it("returns 401 when no token is provided", async () => {
    app = await buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      payload: { name: "João" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 when assigning a planId", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { planId: "cjld2cyuq0000t3rmniod1foy" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 when removing plan assignment (planId: null)", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { planId: null },
    });
    expect(res.statusCode).toBe(200);
  });

  it("calls updateMember with correct clubId, memberId, and actorId", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { name: "Novo Nome" },
    });
    expect(mockUpdateMember).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      "member-001",
      expect.objectContaining({ name: "Novo Nome" }),
    );
  });

  it("does not call updateMember when validation fails", async () => {
    app = await buildTestApp();
    const token = issueAccessToken(app, ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/api/members/member-001",
      headers: { Authorization: `Bearer ${token}` },
      payload: { status: "INVALID_STATUS" },
    });
    expect(mockUpdateMember).not.toHaveBeenCalled();
  });
});
