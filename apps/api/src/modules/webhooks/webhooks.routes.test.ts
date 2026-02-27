import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../payments/gateway.registry.js", () => ({
  GatewayRegistry: {
    get: vi.fn(),
  },
}));

vi.mock("./webhooks.service.js", () => ({
  enqueueWebhookEvent: vi.fn().mockResolvedValue(undefined),
}));

import { GatewayRegistry } from "../payments/gateway.registry.js";
import { WebhookSignatureError } from "../payments/gateway.interface.js";
import { enqueueWebhookEvent } from "./webhooks.service.js";
import { webhookRoutes } from "./webhooks.routes.js";

const VALID_SECRET = "test-webhook-secret-value";

const VALID_ASAAS_PAYLOAD = JSON.stringify({
  event: "PAYMENT_RECEIVED",
  payment: {
    id: "pay_asaas_001",
    nossoNumero: "txid_001",
    externalReference: "charge-internal-001",
    value: 149.9,
    status: "RECEIVED",
  },
});

const MOCK_EVENT = {
  type: "PAYMENT_RECEIVED" as const,
  gatewayTxId: "txid_001",
  externalReference: "charge-internal-001",
  amountCents: 14990,
  rawPayload: {},
};

async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis;

  const mockWebhookQueue = {} as never;

  fastify.decorate("redis", mockRedis);
  fastify.decorate("prisma", {} as never);
  fastify.decorate("webhookQueue", mockWebhookQueue);

  await fastify.register(webhookRoutes, { prefix: "/webhooks" });
  await fastify.ready();
  return fastify;
}

function buildMockGateway(
  overrides: {
    parseWebhookImpl?: () => ReturnType<
      (typeof MOCK_EVENT)["type"] extends string ? never : never
    >;
    parseWebhookFn?: () => unknown;
  } = {},
) {
  return {
    name: "asaas",
    supportedMethods: ["PIX", "CREDIT_CARD"],
    createCharge: vi.fn(),
    cancelCharge: vi.fn(),
    parseWebhook: overrides.parseWebhookFn
      ? vi.fn(overrides.parseWebhookFn)
      : vi.fn().mockReturnValue(MOCK_EVENT),
  };
}

describe("POST /webhooks/:gateway — T-026", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app?.close();
  });

  it("W-1: returns 200 { received: true } and enqueues the event for a valid request", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    expect(enqueueWebhookEvent).toHaveBeenCalledOnce();
    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      MOCK_EVENT,
    );
  });

  it("W-2: returns 401 and does NOT enqueue when parseWebhook throws WebhookSignatureError", async () => {
    const gateway = buildMockGateway({
      parseWebhookFn: () => {
        throw new WebhookSignatureError("asaas");
      },
    });
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": "wrong-secret",
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
      message: "Invalid webhook signature",
    });
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("W-3: returns 404 when the gateway param is not registered", async () => {
    vi.mocked(GatewayRegistry.get).mockImplementation(() => {
      throw new Error('Gateway "pagarme" is not registered.');
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/pagarme",
      headers: { "content-type": "application/json" },
      payload: "{}",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: 'Unknown gateway: "pagarme"',
    });
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("W-4: returns 500 when parseWebhook throws a non-signature error", async () => {
    const gateway = buildMockGateway({
      parseWebhookFn: () => {
        throw new Error("Unexpected JSON parse failure");
      },
    });
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(res.statusCode).toBe(500);
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("W-5: returns 500 when enqueueWebhookEvent rejects", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);
    vi.mocked(enqueueWebhookEvent).mockRejectedValueOnce(
      new Error("Redis connection lost"),
    );

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(res.statusCode).toBe(500);
  });

  it("W-6: returns 401 when the signature header is absent", async () => {
    const gateway = buildMockGateway({
      parseWebhookFn: () => {
        throw new WebhookSignatureError("asaas");
      },
    });
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: { "content-type": "application/json" },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(res.statusCode).toBe(401);
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it("W-7: passes the gateway-normalised event object to enqueueWebhookEvent unchanged", async () => {
    const normalisedEvent = {
      type: "PAYMENT_RECEIVED" as const,
      gatewayTxId: "txid_asaas_xyz",
      externalReference: "charge-abc",
      amountCents: 9900,
      rawPayload: { event: "PAYMENT_CONFIRMED" },
    };

    const gateway = buildMockGateway({
      parseWebhookFn: () => normalisedEvent,
    });
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: JSON.stringify({
        event: "PAYMENT_CONFIRMED",
        payment: { id: "pay_xyz" },
      }),
    });

    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      normalisedEvent,
    );
  });

  it("passes the raw body as a Buffer to parseWebhook, not a parsed object", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    const callArgs = vi.mocked(gateway.parseWebhook).mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(Buffer.isBuffer(callArgs![0])).toBe(true);
    expect(callArgs![0].toString("utf-8")).toBe(VALID_ASAAS_PAYLOAD);
  });

  it("resolves the gateway using the :gateway URL param", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(GatewayRegistry.get).toHaveBeenCalledWith("asaas");
  });

  it("T-029: responds HTTP 200 before the job is processed (enqueue-then-respond contract)", async () => {
    let resolveEnqueue!: () => void;
    const enqueuePromise = new Promise<void>((res) => {
      resolveEnqueue = res;
    });
    vi.mocked(enqueueWebhookEvent).mockReturnValueOnce(enqueuePromise);

    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    const responsePromise = app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    resolveEnqueue();

    const res = await responsePromise;
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });

  it("T-029: enqueues the event to the correct queue (webhook-events contract)", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(enqueueWebhookEvent).toHaveBeenCalledWith(
      expect.anything(),
      "asaas",
      expect.objectContaining({ type: "PAYMENT_RECEIVED" }),
    );
  });

  it("T-029: route returns { received: true } body shape on success", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/asaas",
      headers: {
        "content-type": "application/json",
        "asaas-access-token": VALID_SECRET,
      },
      payload: VALID_ASAAS_PAYLOAD,
    });

    expect(res.json()).toStrictEqual({ received: true });
  });
});
