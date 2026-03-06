/**
 * Integration tests for POST /api/members/:memberId/remind
 *
 * Exercises the full route handler logic via Fastify inject() with all
 * external dependencies mocked. Covers:
 *   1. Valid memberId with OVERDUE charge → 200 status:"SENT"
 *   2. No OVERDUE charge for member → 404
 *   3. hasRecentMessage returns true → 429 with human-readable message
 *   4. Rate limit consumed → 429 with retryAfterMs-derived message
 *   5. sendWhatsAppMessage returns FAILED → 502 with result body
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../../types/fastify.js";

const {
  mockHasRecentMessage,
  mockCheckAndConsumeWhatsAppRateLimit,
  mockWithTenantSchema,
  mockBuildRenderedMessage,
  mockSendWhatsAppMessage,
  mockGetRedisClient,
} = vi.hoisted(() => ({
  mockHasRecentMessage: vi.fn(),
  mockCheckAndConsumeWhatsAppRateLimit: vi.fn(),
  mockWithTenantSchema: vi.fn(),
  mockBuildRenderedMessage: vi.fn(),
  mockSendWhatsAppMessage: vi.fn(),
  mockGetRedisClient: vi.fn(),
}));

vi.mock("../messages/messages.service.js", () => ({
  hasRecentMessage: mockHasRecentMessage,
}));

vi.mock("../../lib/whatsapp-rate-limit.js", () => ({
  checkAndConsumeWhatsAppRateLimit: mockCheckAndConsumeWhatsAppRateLimit,
}));

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: mockWithTenantSchema,
}));

vi.mock("../templates/templates.service.js", () => ({
  buildRenderedMessage: mockBuildRenderedMessage,
}));

vi.mock("../whatsapp/whatsapp.service.js", () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
}));

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: mockGetRedisClient,
  storeRefreshToken: vi.fn(),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

vi.mock("./members.service.js", () => ({
  listMembers: vi.fn(),
  getMemberById: vi.fn(),
  updateMember: vi.fn(),
  createMember: vi.fn(),
  DuplicateCpfError: class extends Error {
    constructor() {
      super("dup");
      this.name = "DuplicateCpfError";
    }
  },
  PlanNotFoundError: class extends Error {
    constructor() {
      super("plan");
      this.name = "PlanNotFoundError";
    }
  },
  MemberNotFoundError: class extends Error {
    constructor() {
      super("nf");
      this.name = "MemberNotFoundError";
    }
  },
}));

vi.mock("./members-import.service.js", () => ({
  importMembersFromCsv: vi.fn(),
}));

vi.mock("../templates/templates.constants.js", () => ({
  TEMPLATE_KEYS: { CHARGE_REMINDER_MANUAL: "charge_reminder_manual" },
}));

import { memberRoutes } from "./members.routes.js";

const TEST_CLUB_ID = "club_test_999";
const TEST_MEMBER_ID = "mem_overdue_001";
const TEST_ACTOR_ID = "user_actor_abc";

const TEST_USER: AccessTokenPayload = {
  sub: TEST_ACTOR_ID,
  clubId: TEST_CLUB_ID,
  role: "ADMIN",
  type: "access",
};

const MOCK_CHARGE = {
  id: "chg_001",
  amountCents: 9900,
  dueDate: new Date("2025-01-10"),
  gatewayMeta: { pixCopyPaste: "00020126..." },
};

const MOCK_MEMBER_ROW = {
  id: TEST_MEMBER_ID,
  name: "João Inadimplente",
  phone: Buffer.from("encrypted_phone"),
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorate(
    "prisma",
    {} as unknown as import("../../../generated/prisma/index.js").PrismaClient,
  );

  app.addHook("preHandler", async (request) => {
    (request as unknown as { user: AccessTokenPayload }).user = TEST_USER;
    (request as unknown as { actorId: string }).actorId = TEST_ACTOR_ID;
  });

  await app.register(memberRoutes, { prefix: "/api/members" });
  return app;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();

  mockHasRecentMessage.mockResolvedValue(false);
  mockGetRedisClient.mockReturnValue({});
  mockCheckAndConsumeWhatsAppRateLimit.mockResolvedValue({
    allowed: true,
    retryAfterMs: 0,
  });
  mockWithTenantSchema.mockImplementation(
    async (
      _prisma: unknown,
      _clubId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => {
      const mockTx = {
        charge: {
          findFirst: vi.fn().mockResolvedValue(MOCK_CHARGE),
        },
        member: {
          findUnique: vi.fn().mockResolvedValue(MOCK_MEMBER_ROW),
        },
      };
      return fn(mockTx);
    },
  );
  mockBuildRenderedMessage.mockResolvedValue("Cobranças pendentes: R$ 99,00");
  mockSendWhatsAppMessage.mockResolvedValue({
    messageId: "msg_wpp_123",
    status: "SENT",
  });
});

describe("POST /api/members/:memberId/remind", () => {
  /**
   * 1. Happy path: valid member with an OVERDUE charge.
   *    Expects 200 with { status: "SENT" }.
   */
  it("returns 200 with status SENT when member has an OVERDUE charge", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("SENT");
    expect(body.messageId).toBeDefined();
  });

  it("calls sendWhatsAppMessage with the correct clubId, memberId, and template", async () => {
    await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clubId: TEST_CLUB_ID,
        memberId: TEST_MEMBER_ID,
        template: "charge_reminder_manual",
      }),
      TEST_ACTOR_ID,
    );
  });

  it("calls buildRenderedMessage with the charge amount and dueDate", async () => {
    await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(mockBuildRenderedMessage).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      "charge_reminder_manual",
      expect.objectContaining({
        amountCents: MOCK_CHARGE.amountCents,
        dueDate: MOCK_CHARGE.dueDate,
      }),
      MOCK_MEMBER_ROW.name,
    );
  });

  /**
   * 2. No OVERDUE charge for the member (charge.findFirst returns null).
   *    Expects 404.
   */
  it("returns 404 when member has no OVERDUE charge", async () => {
    mockWithTenantSchema.mockImplementation(
      async (
        _prisma: unknown,
        _clubId: string,
        fn: (tx: unknown) => Promise<unknown>,
      ) => {
        const mockTx = {
          charge: { findFirst: vi.fn().mockResolvedValue(null) },
          member: { findUnique: vi.fn().mockResolvedValue(MOCK_MEMBER_ROW) },
        };
        return fn(mockTx);
      },
    );

    const res = await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe("Not Found");
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);
  });

  it("returns 404 when the member row itself is not found", async () => {
    mockWithTenantSchema.mockImplementation(
      async (
        _prisma: unknown,
        _clubId: string,
        fn: (tx: unknown) => Promise<unknown>,
      ) => {
        const mockTx = {
          charge: { findFirst: vi.fn().mockResolvedValue(MOCK_CHARGE) },
          member: { findUnique: vi.fn().mockResolvedValue(null) },
        };
        return fn(mockTx);
      },
    );

    const res = await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(res.statusCode).toBe(404);
  });

  /**
   * 3. hasRecentMessage returns true → 429 with human-readable Portuguese message.
   *    sendWhatsAppMessage must NOT be called.
   */
  it("returns 429 with human-readable message when a message was already sent recently", async () => {
    mockHasRecentMessage.mockResolvedValue(true);

    const res = await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.statusCode).toBe(429);
    expect(body.error).toBe("Too Many Requests");
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(10);
  });

  it("does not call sendWhatsAppMessage when idempotency check blocks the send", async () => {
    mockHasRecentMessage.mockResolvedValue(true);

    await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("passes clubId and memberId to hasRecentMessage", async () => {
    mockHasRecentMessage.mockResolvedValue(false);

    await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(mockHasRecentMessage).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      TEST_MEMBER_ID,
      "charge_reminder_manual",
      expect.any(Number),
    );
  });

  /**
   * 4. Rate limit consumed → 429 with retryAfterMs-based message.
   *    hasRecentMessage returns false, but the rate limit window is exhausted.
   *    sendWhatsAppMessage must NOT be called.
   */
  it("returns 429 when the club WhatsApp rate limit is exhausted", async () => {
    mockCheckAndConsumeWhatsAppRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 15000,
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.statusCode).toBe(429);
    expect(body.error).toBe("Too Many Requests");
    expect(body.message).toContain("15");
  });

  it("does not call sendWhatsAppMessage when rate limit is exhausted", async () => {
    mockCheckAndConsumeWhatsAppRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 5000,
    });

    await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("passes the Redis client and clubId to checkAndConsumeWhatsAppRateLimit", async () => {
    const mockRedis = { ping: vi.fn() };
    mockGetRedisClient.mockReturnValue(mockRedis);

    await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(mockCheckAndConsumeWhatsAppRateLimit).toHaveBeenCalledWith(
      mockRedis,
      TEST_CLUB_ID,
    );
  });

  /**
   * 5. sendWhatsAppMessage captures the provider error and returns status:"FAILED".
   *    Per the sendWhatsAppMessage contract, it never throws — it returns FAILED.
   *    The route returns 502 with the result body.
   */
  it("returns 502 with status FAILED when sendWhatsAppMessage returns FAILED", async () => {
    mockSendWhatsAppMessage.mockResolvedValue({
      messageId: "msg_failed_456",
      status: "FAILED",
      failReason: "Provider timeout",
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(res.statusCode).toBe(502);
    const body = res.json();
    expect(body.status).toBe("FAILED");
    expect(body.failReason).toBe("Provider timeout");
  });

  it("returns 502 with the full result from sendWhatsAppMessage on FAILED status", async () => {
    const failedResult = {
      messageId: "msg_err_789",
      status: "FAILED" as const,
      failReason: "Invalid phone number",
    };
    mockSendWhatsAppMessage.mockResolvedValue(failedResult);

    const res = await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject(failedResult);
  });

  it("still calls hasRecentMessage before rate-limit check (idempotency guard runs first)", async () => {
    mockHasRecentMessage.mockResolvedValue(true);

    await app.inject({
      method: "POST",
      url: `/api/members/${TEST_MEMBER_ID}/remind`,
    });

    expect(mockHasRecentMessage).toHaveBeenCalledOnce();
    expect(mockCheckAndConsumeWhatsAppRateLimit).not.toHaveBeenCalled();
  });
});
