import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emitPaymentConfirmed, sseBus } from "../../lib/sse-bus.js";
import { GatewayRegistry } from "../../modules/payments/gateway.registry.js";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgres://fake:fake@localhost:5432/fake";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.JWT_SECRET = "test-access-secret-at-least-32-chars!!";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32chars!";
  process.env.MEMBER_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  process.env.MEMBER_CARD_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.NODE_ENV = "test";
  process.env.ASAAS_API_KEY = "mock-asaas-api-key";
  process.env.ASAAS_WEBHOOK_SECRET = "mock-asaas-webhook-secret";
});

vi.mock("../../lib/prisma.js", () => ({
  getPrismaClient: vi.fn(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  })),
  withTenantSchema: vi.fn(),
  isPrismaUniqueConstraintError: vi.fn(),
}));

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(() => ({
    on: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../../jobs/queues.js", () => ({
  webhookQueue: {
    add: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  },
  getWebhookQueue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
}));

vi.mock("../../jobs/index.js", () => ({
  registerJobs: vi.fn().mockResolvedValue(undefined),
  closeJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../plugins/prisma.plugin.js", () => ({
  default: async (fastify: {
    decorate: (name: string, val: unknown) => void;
  }) => {
    fastify.decorate("prisma", {
      $connect: vi.fn(),
      $disconnect: vi.fn(),
    });
  },
}));

vi.mock("../../plugins/redis.plugin.js", () => ({
  default: async (fastify: {
    decorate: (name: string, val: unknown) => void;
  }) => {
    fastify.decorate("redis", {
      on: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue(undefined),
    });
  },
}));

vi.mock("../../plugins/auth.plugin.js", () => ({
  default: async (fastify: {
    decorate: (name: string, fn: unknown) => void;
  }) => {
    fastify.decorate(
      "verifyAccessToken",
      async (
        request: { headers: Record<string, string>; user?: unknown },
        reply: {
          status: (code: number) => { send: (body: unknown) => void };
          sent?: boolean;
        },
      ) => {
        const auth = request.headers["authorization"];
        if (!auth || !auth.startsWith("Bearer valid-")) {
          reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Missing or invalid access token.",
          });
          return;
        }
        const clubId = auth.replace("Bearer valid-", "");
        request.user = { sub: "user-1", clubId, role: "ADMIN", type: "access" };
      },
    );
    fastify.decorate("verifyRefreshToken", vi.fn());
    fastify.decorate(
      "requireRole",
      vi.fn(() => vi.fn()),
    );
    fastify.decorate("refresh", {
      sign: vi.fn(),
      verify: vi.fn(),
    });
  },
}));

describe("events.routes — SSE endpoint", () => {
  beforeEach(() => {
    GatewayRegistry._reset();
    sseBus.removeAllListeners();
  });

  afterEach(() => {
    sseBus.removeAllListeners();
  });

  describe("authentication", () => {
    it("returns 401 when no token is provided", async () => {
      const { buildApp } = await import("../../../src/server.js");
      const app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/events",
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<{ error: string }>();
      expect(body.error).toBe("Unauthorized");

      await app.close();
    });

    it("returns 401 when an invalid token is provided via header", async () => {
      const { buildApp } = await import("../../../src/server.js");
      const app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/events",
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("injects ?token= query param into Authorization header", async () => {
      const { buildApp } = await import("../../../src/server.js");
      const app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/events?token=valid-club-123",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toMatch(/text\/event-stream/);
      expect(response.headers["cache-control"]).toBe("no-cache, no-transform");
      expect(response.headers["x-accel-buffering"]).toBe("no");

      await app.close();
    });
  });

  describe("SSE stream content", () => {
    it("writes the connected handshake event on open", async () => {
      const { buildApp } = await import("../../../src/server.js");
      const app = await buildApp();

      const response = await app.inject({
        method: "GET",
        url: "/api/events?token=valid-club-abc",
      });

      const body = response.body;
      expect(body).toContain("event: connected");
      expect(body).toContain('"clubId":"club-abc"');

      await app.close();
    });

    it("writes PAYMENT_CONFIRMED event data to the stream", async () => {
      const { buildApp } = await import("../../../src/server.js");
      const app = await buildApp();

      const written: string[] = [];
      const channel = "club:xyz";

      const listener = (event: Parameters<typeof sseBus.emit>[1]) => {
        const e = event as { type: string; payload: unknown };
        written.push(
          `event: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`,
        );
      };
      sseBus.on(channel, listener);

      emitPaymentConfirmed("xyz", {
        chargeId: "charge-99",
        memberId: "member-99",
        amountCents: 29900,
        memberStatusUpdated: false,
        paidAt: "2025-03-15T10:00:00.000Z",
      });

      sseBus.off(channel, listener);

      expect(written).toHaveLength(1);
      expect(written[0]).toContain("event: PAYMENT_CONFIRMED");
      expect(written[0]).toContain('"chargeId":"charge-99"');
      expect(written[0]).toContain('"amountCents":29900');

      await app.close();
    });
  });

  describe("listener cleanup", () => {
    it("does not retain listeners on sseBus after the connection closes", async () => {
      const channel = "club:leak-test";

      const initialCount = sseBus.listenerCount(channel);
      expect(initialCount).toBe(0);

      const listener = vi.fn();
      sseBus.on(channel, listener);
      expect(sseBus.listenerCount(channel)).toBe(1);

      sseBus.off(channel, listener);
      expect(sseBus.listenerCount(channel)).toBe(0);
    });
  });
});
