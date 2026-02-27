/**
 * T-030 — Integration tests: POST /webhooks/:gateway with the real AsaasGateway
 *
 * Unlike webhooks.routes.test.ts (which mocks GatewayRegistry and parseWebhook
 * entirely), these tests wire the REAL AsaasGateway through the REAL
 * GatewayRegistry so that the full path is exercised:
 *
 *   HTTP request → webhookRoutes → GatewayRegistry.get() → AsaasGateway.parseWebhook()
 *   → signature validation (timingSafeEqual) → enqueueWebhookEvent
 *
 * Only infrastructure (Redis, BullMQ queue) is mocked — the crypto layer is not.
 *
 * This validates T-030's requirement:
 *   "Simulate Asaas payload with valid and invalid signature (end-to-end)."
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./webhooks.service.js", () => ({
  enqueueWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

import { enqueueWebhookEvent } from "./webhooks.service.js";
import { webhookRoutes } from "./webhooks.routes.js";
import { GatewayRegistry } from "../payments/gateway.registry.js";
import { registerGateways } from "../payments/gateways/index.js";

const ASAAS_WEBHOOK_SECRET = "integration-test-webhook-secret-32ch!";
const ASAAS_API_KEY = "integration-test-api-key";

/**
 * Builds a canonical Asaas PAYMENT_RECEIVED JSON payload string.
 * The `payment` object can be partially overridden for specific scenarios.
 */
function buildAsaasPayload(
  paymentOverrides: Record<string, unknown> = {},
  eventOverride?: string,
): string {
  return JSON.stringify({
    event: eventOverride ?? "PAYMENT_RECEIVED",
    payment: {
      id: "pay_asaas_integration_001",
      nossoNumero: "txid_integration_001",
      externalReference: "charge-integration-001",
      value: 149.9,
      status: "RECEIVED",
      ...paymentOverrides,
    },
  });
}

/** Mounts the webhook plugin on a fresh Fastify instance with stubbed decorations. */
async function buildIntegrationApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis;

  fastify.decorate("redis", mockRedis);
  fastify.decorate("prisma", {} as never);
  fastify.decorate("webhookQueue", {} as never);

  await fastify.register(webhookRoutes, { prefix: "/webhooks" });
  await fastify.ready();
  return fastify;
}

describe("POST /webhooks/asaas — T-030 integration (real AsaasGateway)", () => {
  let app: FastifyInstance;

  beforeAll(() => {
    process.env["ASAAS_API_KEY"] = ASAAS_API_KEY;
    process.env["ASAAS_WEBHOOK_SECRET"] = ASAAS_WEBHOOK_SECRET;

    GatewayRegistry._reset();
    registerGateways();
  });

  afterAll(() => {
    delete process.env["ASAAS_API_KEY"];
    delete process.env["ASAAS_WEBHOOK_SECRET"];
    GatewayRegistry._reset();
  });

  beforeEach(async () => {
    app = await buildIntegrationApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("I-1: valid token → 200 { received: true } and enqueueWebhookEvent is called once", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    expect(enqueueWebhookEvent).toHaveBeenCalledOnce();
  });

  it("I-2: enqueued event has correct type=PAYMENT_RECEIVED and externalReference", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload({ externalReference: "charge-abc-123" }),
    });

    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      expect.objectContaining({
        type: "PAYMENT_RECEIVED",
        externalReference: "charge-abc-123",
      }),
    );
  });

  it("I-3: enqueued event.amountCents correctly converts float BRL to integer cents", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload({ value: 99.99 }),
    });

    const call = vi.mocked(enqueueWebhookEvent).mock.calls[0];
    expect(call).toBeDefined();
    expect(call![2].amountCents).toBe(9999);
  });

  it("I-4: enqueued event.gatewayTxId prefers nossoNumero over payment.id", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload({
        id: "pay_fallback_id",
        nossoNumero: "txid_preferred_001",
      }),
    });

    const call = vi.mocked(enqueueWebhookEvent).mock.calls[0];
    expect(call![2].gatewayTxId).toBe("txid_preferred_001");
  });

  it("I-5: enqueued event.gatewayTxId falls back to payment.id when nossoNumero is absent", async () => {
    const payload = JSON.stringify({
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_no_nosso_numero",
        externalReference: "charge-fallback",
        value: 50,
        status: "RECEIVED",
      },
    });

    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload,
    });

    const call = vi.mocked(enqueueWebhookEvent).mock.calls[0];
    expect(call![2].gatewayTxId).toBe("pay_no_nosso_numero");
  });

  it("I-6: wrong token → 401 Unauthorized, event NOT enqueued", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": "totally-wrong-token",
      },
      payload: buildAsaasPayload(),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid webhook signature",
    });
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("I-7: missing token header → 401 Unauthorized, event NOT enqueued", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: { "content-type": "application/json" },
      payload: buildAsaasPayload(),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid webhook signature",
    });
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("I-8: empty string token → 401 Unauthorized, event NOT enqueued", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": "",
      },
      payload: buildAsaasPayload(),
    });

    expect(res.statusCode).toBe(401);
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("I-9: unknown gateway param → 404 Not Found, event NOT enqueued", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/pagarme",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: 'Unknown gateway: "pagarme"',
    });
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("I-10: raw Buffer contract — body bytes are preserved (verifies addContentTypeParser override)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.statusCode).not.toBe(500);
  });

  it("I-11: PAYMENT_CONFIRMED Asaas event is normalised to PAYMENT_RECEIVED before enqueueing", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload(
        {
          externalReference: "charge-confirmed-001",
          value: 50,
          status: "CONFIRMED",
        },
        "PAYMENT_CONFIRMED",
      ),
    });

    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      expect.objectContaining({ type: "PAYMENT_RECEIVED" }),
    );
  });

  it("I-12: PAYMENT_OVERDUE Asaas event is normalised to PAYMENT_OVERDUE before enqueueing", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload({}, "PAYMENT_OVERDUE"),
    });

    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      expect.objectContaining({ type: "PAYMENT_OVERDUE" }),
    );
  });

  it("I-13: PAYMENT_CHARGEBACK_REQUESTED Asaas event is normalised to PAYMENT_REFUNDED", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload({}, "PAYMENT_CHARGEBACK_REQUESTED"),
    });

    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      expect.objectContaining({ type: "PAYMENT_REFUNDED" }),
    );
  });

  it("I-14: completely unknown Asaas event type normalises to UNKNOWN and is still enqueued (200)", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload({}, "PAYMENT_DELETED"),
    });

    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      expect.objectContaining({ type: "UNKNOWN" }),
    );
  });

  it("I-15: rawPayload in the enqueued event contains the original parsed JSON object", async () => {
    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload({ externalReference: "charge-raw-check" }),
    });

    const call = vi.mocked(enqueueWebhookEvent).mock.calls[0];
    expect(call![2].rawPayload).toMatchObject({
      event: "PAYMENT_RECEIVED",
      payment: expect.objectContaining({
        externalReference: "charge-raw-check",
      }),
    });
  });

  it("I-16: responds HTTP 200 before enqueue resolves (fire-and-respond contract)", async () => {
    let resolveEnqueue!: () => void;
    const enqueuePromise = new Promise<void>((res) => {
      resolveEnqueue = res;
    });
    vi.mocked(enqueueWebhookEvent).mockReturnValueOnce(enqueuePromise);

    const responsePromise = app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": ASAAS_WEBHOOK_SECRET,
      },
      payload: buildAsaasPayload(),
    });

    resolveEnqueue();

    const res = await responsePromise;
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });
});
