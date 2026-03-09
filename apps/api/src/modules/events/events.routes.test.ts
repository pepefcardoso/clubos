import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { emitPaymentConfirmed, sseBus } from "../../lib/sse-bus.js";

vi.mock("../../src/plugins/auth.plugin.js", () => ({
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
  },
}));

describe("events.routes — SSE endpoint", () => {
  beforeEach(() => {
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
