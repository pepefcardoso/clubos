import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AsaasGateway } from "./asaas.gateway.js";
import { WebhookSignatureError } from "../gateway.interface.js";

const WEBHOOK_SECRET = "super-secret-webhook-token-32chars!";

function buildGateway(): AsaasGateway {
  return new AsaasGateway({
    apiKey: "test-api-key",
    webhookSecret: WEBHOOK_SECRET,
    sandbox: true,
  });
}

function validHeaders(): Record<string, string> {
  return { "asaas-access-token": WEBHOOK_SECRET };
}

function rawBody(payload: object): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf-8");
}

const PAYMENT_RECEIVED_PAYLOAD = {
  event: "PAYMENT_RECEIVED",
  payment: {
    id: "pay_001",
    nossoNumero: "txid_001",
    externalReference: "charge-internal-001",
    value: 149.9,
    status: "RECEIVED",
  },
};

describe("AsaasGateway.parseWebhook — signature validation", () => {
  it("accepts a request with the correct asaas-access-token header", () => {
    const gateway = buildGateway();
    const event = gateway.parseWebhook(
      rawBody(PAYMENT_RECEIVED_PAYLOAD),
      validHeaders(),
    );
    expect(event).toBeDefined();
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("throws WebhookSignatureError when the token header is missing", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(PAYMENT_RECEIVED_PAYLOAD), {}),
    ).toThrow(WebhookSignatureError);
  });

  it("throws WebhookSignatureError when the token value is wrong", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(PAYMENT_RECEIVED_PAYLOAD), {
        "asaas-access-token": "wrong-secret",
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("throws WebhookSignatureError when the token is an empty string", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(PAYMENT_RECEIVED_PAYLOAD), {
        "asaas-access-token": "",
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("WebhookSignatureError message includes the gateway name", () => {
    const gateway = buildGateway();
    let caught: unknown;
    try {
      gateway.parseWebhook(rawBody(PAYMENT_RECEIVED_PAYLOAD), {
        "asaas-access-token": "bad",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WebhookSignatureError);
    expect((caught as WebhookSignatureError).message).toContain("asaas");
  });

  it("accepts an array header value (multi-value headers)", () => {
    const gateway = buildGateway();
    const event = gateway.parseWebhook(rawBody(PAYMENT_RECEIVED_PAYLOAD), {
      "asaas-access-token": [WEBHOOK_SECRET, "extra"],
    } as Record<string, string[]>);
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });
});

describe("AsaasGateway.parseWebhook — event type normalisation", () => {
  let gateway: AsaasGateway;

  beforeEach(() => {
    gateway = buildGateway();
  });

  it("PAYMENT_RECEIVED → PAYMENT_RECEIVED", () => {
    const event = gateway.parseWebhook(
      rawBody({ ...PAYMENT_RECEIVED_PAYLOAD, event: "PAYMENT_RECEIVED" }),
      validHeaders(),
    );
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("PAYMENT_CONFIRMED → PAYMENT_RECEIVED (Asaas synonym)", () => {
    const event = gateway.parseWebhook(
      rawBody({ ...PAYMENT_RECEIVED_PAYLOAD, event: "PAYMENT_CONFIRMED" }),
      validHeaders(),
    );
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("PAYMENT_REFUNDED → PAYMENT_REFUNDED", () => {
    const event = gateway.parseWebhook(
      rawBody({ ...PAYMENT_RECEIVED_PAYLOAD, event: "PAYMENT_REFUNDED" }),
      validHeaders(),
    );
    expect(event.type).toBe("PAYMENT_REFUNDED");
  });

  it("PAYMENT_CHARGEBACK_REQUESTED → PAYMENT_REFUNDED", () => {
    const event = gateway.parseWebhook(
      rawBody({
        ...PAYMENT_RECEIVED_PAYLOAD,
        event: "PAYMENT_CHARGEBACK_REQUESTED",
      }),
      validHeaders(),
    );
    expect(event.type).toBe("PAYMENT_REFUNDED");
  });

  it("PAYMENT_OVERDUE → PAYMENT_OVERDUE", () => {
    const event = gateway.parseWebhook(
      rawBody({ ...PAYMENT_RECEIVED_PAYLOAD, event: "PAYMENT_OVERDUE" }),
      validHeaders(),
    );
    expect(event.type).toBe("PAYMENT_OVERDUE");
  });

  it("unknown event type → UNKNOWN", () => {
    const event = gateway.parseWebhook(
      rawBody({ event: "PAYMENT_DELETED", payment: { id: "pay_002" } }),
      validHeaders(),
    );
    expect(event.type).toBe("UNKNOWN");
  });
});

describe("AsaasGateway.parseWebhook — WebhookEvent fields", () => {
  let gateway: AsaasGateway;

  beforeEach(() => {
    gateway = buildGateway();
  });

  it("prefers nossoNumero over payment.id for gatewayTxId", () => {
    const event = gateway.parseWebhook(
      rawBody(PAYMENT_RECEIVED_PAYLOAD),
      validHeaders(),
    );
    expect(event.gatewayTxId).toBe("txid_001");
  });

  it("falls back to payment.id when nossoNumero is absent", () => {
    const payload = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_fallback", value: 100 },
    };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders());
    expect(event.gatewayTxId).toBe("pay_fallback");
  });

  it("returns empty string for gatewayTxId when payment is absent", () => {
    const payload = { event: "PAYMENT_OVERDUE" };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders());
    expect(event.gatewayTxId).toBe("");
  });

  it("maps externalReference correctly", () => {
    const event = gateway.parseWebhook(
      rawBody(PAYMENT_RECEIVED_PAYLOAD),
      validHeaders(),
    );
    expect(event.externalReference).toBe("charge-internal-001");
  });

  it("externalReference is undefined when not present in payload", () => {
    const payload = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_003", value: 50 },
    };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders());
    expect(event.externalReference).toBeUndefined();
  });

  it("converts float BRL value to integer cents with Math.round", () => {
    const event = gateway.parseWebhook(
      rawBody(PAYMENT_RECEIVED_PAYLOAD),
      validHeaders(),
    );
    expect(event.amountCents).toBe(14990);
  });

  it("amountCents is undefined when payment.value is absent", () => {
    const payload = { event: "PAYMENT_OVERDUE", payment: { id: "pay_004" } };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders());
    expect(event.amountCents).toBeUndefined();
  });

  it("includes rawPayload with the parsed JSON object", () => {
    const event = gateway.parseWebhook(
      rawBody(PAYMENT_RECEIVED_PAYLOAD),
      validHeaders(),
    );
    expect(event.rawPayload).toMatchObject({ event: "PAYMENT_RECEIVED" });
  });
});

describe("AsaasGateway.parseWebhook — edge cases", () => {
  it("throws a generic Error (not WebhookSignatureError) for non-JSON body after valid token", () => {
    const gateway = buildGateway();
    const nonJsonBody = Buffer.from("not-valid-json", "utf-8");
    expect(() => gateway.parseWebhook(nonJsonBody, validHeaders())).toThrow(
      /failed to parse webhook body/i,
    );
  });

  it("does not throw for an empty payment object", () => {
    const gateway = buildGateway();
    const payload = { event: "PAYMENT_OVERDUE", payment: {} };
    expect(() =>
      gateway.parseWebhook(rawBody(payload), validHeaders()),
    ).not.toThrow();
  });
});
