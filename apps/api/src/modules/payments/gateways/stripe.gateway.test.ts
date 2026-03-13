import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StripeGateway } from "./stripe.gateway.js";
import { WebhookSignatureError } from "../gateway.interface.js";

const WEBHOOK_SECRET = "whsec_test_super_secret_stripe_32chars!";
const SECRET_KEY = "sk_test_fake_key";

const FIXED_NOW_SECONDS = 1700000000;

function buildGateway(): StripeGateway {
  return new StripeGateway({
    secretKey: SECRET_KEY,
    webhookSecret: WEBHOOK_SECRET,
  });
}

/** Computes a valid v1 HMAC-SHA256 signature for the given body and timestamp. */
function sign(body: object, timestamp = FIXED_NOW_SECONDS): string {
  const raw = JSON.stringify(body);
  return createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
}

/** Returns a valid stripe-signature header value for the given body. */
function sigHeader(body: object, timestamp = FIXED_NOW_SECONDS): string {
  return `t=${timestamp},v1=${sign(body, timestamp)}`;
}

function rawBody(payload: object): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf-8");
}

const PAYMENT_INTENT_SUCCEEDED_PAYLOAD = {
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: "pi_test_001",
      amount: 9900,
      latest_charge: "ch_test_001",
      metadata: { idempotencyKey: "idem-001" },
    },
  },
};

const CHARGE_REFUNDED_PAYLOAD = {
  type: "charge.refunded",
  data: {
    object: {
      id: "ch_refund_001",
      amount: 9900,
      metadata: { idempotencyKey: "idem-002" },
    },
  },
};

function mockFetch(response: object, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(response),
      json: async () => response,
    }),
  );
}

const MOCK_PAYMENT_INTENT_RESPONSE = {
  id: "pi_neworder_001",
  status: "requires_action",
  amount: 9900,
  metadata: { idempotencyKey: "idem-key-001" },
  next_action: {
    type: "pix_display_qr_code",
    pix_display_qr_code: {
      data: "00020101021226580014br.gov.bcb.pix...",
      image_url_png: "https://qr.stripe.com/test_qr.png",
    },
  },
};

const CHARGE_INPUT = {
  amountCents: 9900,
  dueDate: new Date("2025-12-31"),
  method: "PIX" as const,
  customer: {
    name: "João Silva",
    cpf: "12345678900",
    phone: "11999990000",
    email: "joao@example.com",
  },
  description: "Mensalidade ClubOS",
  idempotencyKey: "idem-key-001",
};

describe("StripeGateway.parseWebhook — signature validation", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(FIXED_NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("accepts a request with a correct stripe-signature header", () => {
    const gateway = buildGateway();
    const payload = PAYMENT_INTENT_SUCCEEDED_PAYLOAD;
    const event = gateway.parseWebhook(rawBody(payload), {
      "stripe-signature": sigHeader(payload),
    });
    expect(event).toBeDefined();
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("throws WebhookSignatureError when the stripe-signature header is missing", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(PAYMENT_INTENT_SUCCEEDED_PAYLOAD), {}),
    ).toThrow(WebhookSignatureError);
  });

  it("throws WebhookSignatureError when the signature is wrong", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(PAYMENT_INTENT_SUCCEEDED_PAYLOAD), {
        "stripe-signature": `t=${FIXED_NOW_SECONDS},v1=deadbeef00000000`,
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("throws WebhookSignatureError when the signature is an empty string", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(PAYMENT_INTENT_SUCCEEDED_PAYLOAD), {
        "stripe-signature": "",
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("throws WebhookSignatureError when the timestamp is older than 5 minutes", () => {
    const gateway = buildGateway();
    const staleTimestamp = FIXED_NOW_SECONDS - 301;
    const payload = PAYMENT_INTENT_SUCCEEDED_PAYLOAD;
    expect(() =>
      gateway.parseWebhook(rawBody(payload), {
        "stripe-signature": sigHeader(payload, staleTimestamp),
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("throws WebhookSignatureError when the timestamp is more than 5 minutes in the future", () => {
    const gateway = buildGateway();
    const futureTimestamp = FIXED_NOW_SECONDS + 301;
    const payload = PAYMENT_INTENT_SUCCEEDED_PAYLOAD;
    expect(() =>
      gateway.parseWebhook(rawBody(payload), {
        "stripe-signature": sigHeader(payload, futureTimestamp),
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("accepts a timestamp exactly at the 300-second boundary", () => {
    const gateway = buildGateway();
    const borderTimestamp = FIXED_NOW_SECONDS - 300;
    const payload = PAYMENT_INTENT_SUCCEEDED_PAYLOAD;
    expect(() =>
      gateway.parseWebhook(rawBody(payload), {
        "stripe-signature": sigHeader(payload, borderTimestamp),
      }),
    ).not.toThrow();
  });

  it("accepts an array header value (multi-value headers)", () => {
    const gateway = buildGateway();
    const payload = PAYMENT_INTENT_SUCCEEDED_PAYLOAD;
    const sig = sigHeader(payload);
    const event = gateway.parseWebhook(rawBody(payload), {
      "stripe-signature": [sig, "extra-value"] as unknown as string,
    });
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("WebhookSignatureError message includes 'stripe'", () => {
    const gateway = buildGateway();
    let caught: unknown;
    try {
      gateway.parseWebhook(rawBody(PAYMENT_INTENT_SUCCEEDED_PAYLOAD), {
        "stripe-signature": `t=${FIXED_NOW_SECONDS},v1=badsig`,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WebhookSignatureError);
    expect((caught as WebhookSignatureError).message).toContain("stripe");
  });
});

describe("StripeGateway.parseWebhook — event type normalisation", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(FIXED_NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function parse(gateway: StripeGateway, payload: object) {
    return gateway.parseWebhook(rawBody(payload), {
      "stripe-signature": sigHeader(payload),
    });
  }

  it("payment_intent.succeeded → PAYMENT_RECEIVED", () => {
    const gateway = buildGateway();
    const event = parse(gateway, PAYMENT_INTENT_SUCCEEDED_PAYLOAD);
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("charge.refunded → PAYMENT_REFUNDED", () => {
    const gateway = buildGateway();
    const event = parse(gateway, CHARGE_REFUNDED_PAYLOAD);
    expect(event.type).toBe("PAYMENT_REFUNDED");
  });

  it("payment_intent.payment_failed → UNKNOWN", () => {
    const gateway = buildGateway();
    const payload = {
      ...PAYMENT_INTENT_SUCCEEDED_PAYLOAD,
      type: "payment_intent.payment_failed",
    };
    const event = parse(gateway, payload);
    expect(event.type).toBe("UNKNOWN");
  });

  it("payment_intent.canceled → UNKNOWN", () => {
    const gateway = buildGateway();
    const payload = {
      ...PAYMENT_INTENT_SUCCEEDED_PAYLOAD,
      type: "payment_intent.canceled",
    };
    const event = parse(gateway, payload);
    expect(event.type).toBe("UNKNOWN");
  });

  it("unknown event string → UNKNOWN", () => {
    const gateway = buildGateway();
    const payload = {
      ...PAYMENT_INTENT_SUCCEEDED_PAYLOAD,
      type: "customer.created",
    };
    const event = parse(gateway, payload);
    expect(event.type).toBe("UNKNOWN");
  });
});

describe("StripeGateway.parseWebhook — WebhookEvent fields", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(FIXED_NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function parse(gateway: StripeGateway, payload: object) {
    return gateway.parseWebhook(rawBody(payload), {
      "stripe-signature": sigHeader(payload),
    });
  }

  it("uses latest_charge as gatewayTxId when present", () => {
    const gateway = buildGateway();
    const event = parse(gateway, PAYMENT_INTENT_SUCCEEDED_PAYLOAD);
    expect(event.gatewayTxId).toBe("ch_test_001");
  });

  it("falls back to data.object.id when latest_charge is absent", () => {
    const gateway = buildGateway();
    const payload = {
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_fallback_001",
          amount: 5000,
          metadata: {},
        },
      },
    };
    const event = parse(gateway, payload);
    expect(event.gatewayTxId).toBe("pi_fallback_001");
  });

  it("maps metadata.idempotencyKey to externalReference", () => {
    const gateway = buildGateway();
    const event = parse(gateway, PAYMENT_INTENT_SUCCEEDED_PAYLOAD);
    expect(event.externalReference).toBe("idem-001");
  });

  it("externalReference is undefined when metadata is absent", () => {
    const gateway = buildGateway();
    const payload = {
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_nometa", amount: 1000 } },
    };
    const event = parse(gateway, payload);
    expect(event.externalReference).toBeUndefined();
  });

  it("externalReference is undefined when idempotencyKey is not in metadata", () => {
    const gateway = buildGateway();
    const payload = {
      type: "charge.refunded",
      data: {
        object: { id: "ch_nometa", amount: 1000, metadata: { other: "value" } },
      },
    };
    const event = parse(gateway, payload);
    expect(event.externalReference).toBeUndefined();
  });

  it("maps data.object.amount to amountCents (already in cents, no conversion)", () => {
    const gateway = buildGateway();
    const event = parse(gateway, PAYMENT_INTENT_SUCCEEDED_PAYLOAD);
    expect(event.amountCents).toBe(9900);
  });

  it("amountCents is undefined when data.object.amount is absent", () => {
    const gateway = buildGateway();
    const payload = {
      type: "payment_intent.canceled",
      data: { object: { id: "pi_noamt" } },
    };
    const event = parse(gateway, payload);
    expect(event.amountCents).toBeUndefined();
  });

  it("includes rawPayload with the parsed JSON object", () => {
    const gateway = buildGateway();
    const event = parse(gateway, PAYMENT_INTENT_SUCCEEDED_PAYLOAD);
    expect(event.rawPayload).toMatchObject({
      type: "payment_intent.succeeded",
    });
  });
});

describe("StripeGateway.parseWebhook — edge cases", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(FIXED_NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws a generic Error (not WebhookSignatureError) for non-JSON body with valid signature", () => {
    const gateway = buildGateway();
    const nonJson = Buffer.from("not-valid-json", "utf-8");
    const ts = FIXED_NOW_SECONDS;
    const sig = createHmac("sha256", WEBHOOK_SECRET)
      .update(`${ts}.not-valid-json`)
      .digest("hex");

    expect(() =>
      gateway.parseWebhook(nonJson, {
        "stripe-signature": `t=${ts},v1=${sig}`,
      }),
    ).toThrow(/failed to parse webhook body/i);
  });

  it("the parse error is NOT a WebhookSignatureError", () => {
    const gateway = buildGateway();
    const nonJson = Buffer.from("not-valid-json", "utf-8");
    const ts = FIXED_NOW_SECONDS;
    const sig = createHmac("sha256", WEBHOOK_SECRET)
      .update(`${ts}.not-valid-json`)
      .digest("hex");

    let caught: unknown;
    try {
      gateway.parseWebhook(nonJson, {
        "stripe-signature": `t=${ts},v1=${sig}`,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(WebhookSignatureError);
  });

  it("does not throw for a minimal payload with no optional fields", () => {
    const gateway = buildGateway();
    const payload = {
      type: "payment_intent.canceled",
      data: { object: { id: "pi_minimal" } },
    };
    expect(() =>
      gateway.parseWebhook(rawBody(payload), {
        "stripe-signature": sigHeader(payload),
      }),
    ).not.toThrow();
  });

  it("handles a stripe-signature header with a v0 entry alongside v1", () => {
    const gateway = buildGateway();
    const payload = PAYMENT_INTENT_SUCCEEDED_PAYLOAD;
    const ts = FIXED_NOW_SECONDS;
    const v1 = sign(payload, ts);
    const event = gateway.parseWebhook(rawBody(payload), {
      "stripe-signature": `t=${ts},v0=oldsig,v1=${v1}`,
    });
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });
});

describe("StripeGateway.createCharge — PIX", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(FIXED_NOW_SECONDS * 1000));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends a correct Authorization: Bearer header", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    await gateway.createCharge(CHARGE_INPUT);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("sends the Idempotency-Key header equal to the idempotencyKey", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    await gateway.createCharge(CHARGE_INPUT);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = options.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("idem-key-001");
  });

  it("calls POST /v1/payment_intents endpoint", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    await gateway.createCharge(CHARGE_INPUT);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
  });

  it("sends amount in cents without conversion", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    await gateway.createCharge(CHARGE_INPUT);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = new URLSearchParams(options.body as string);
    expect(body.get("amount")).toBe("9900");
    expect(body.get("currency")).toBe("brl");
  });

  it("includes payment_method_types[]=pix in the request body", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    await gateway.createCharge(CHARGE_INPUT);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = new URLSearchParams(options.body as string);
    expect(body.get("payment_method_types[]")).toBe("pix");
    expect(body.get("confirm")).toBe("true");
  });

  it("sets metadata[idempotencyKey] in the request body", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    await gateway.createCharge(CHARGE_INPUT);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = new URLSearchParams(options.body as string);
    expect(body.get("metadata[idempotencyKey]")).toBe("idem-key-001");
  });

  it("returns externalId equal to the PaymentIntent id", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.externalId).toBe("pi_neworder_001");
  });

  it("returns meta.pixCopyPaste from next_action.pix_display_qr_code.data", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.meta["pixCopyPaste"]).toBe(
      "00020101021226580014br.gov.bcb.pix...",
    );
  });

  it("returns meta.qrCodeUrl from next_action.pix_display_qr_code.image_url_png", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.meta["qrCodeUrl"]).toBe("https://qr.stripe.com/test_qr.png");
  });

  it("returns meta.paymentIntentId equal to the PaymentIntent id", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.meta["paymentIntentId"]).toBe("pi_neworder_001");
  });

  it("status is PENDING when Stripe returns requires_action", async () => {
    mockFetch(MOCK_PAYMENT_INTENT_RESPONSE);
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.status).toBe("PENDING");
  });

  it("status is PAID when Stripe returns succeeded", async () => {
    mockFetch({ ...MOCK_PAYMENT_INTENT_RESPONSE, status: "succeeded" });
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.status).toBe("PAID");
  });

  it("status is CANCELLED when Stripe returns canceled", async () => {
    mockFetch({ ...MOCK_PAYMENT_INTENT_RESPONSE, status: "canceled" });
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.status).toBe("CANCELLED");
  });

  it("returns empty strings for pixCopyPaste and qrCodeUrl when next_action is absent", async () => {
    const responseWithoutNextAction = {
      id: "pi_noaction",
      status: "requires_action",
      amount: 9900,
      metadata: {},
    };
    mockFetch(responseWithoutNextAction);
    const gateway = buildGateway();
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.meta["pixCopyPaste"]).toBe("");
    expect(result.meta["qrCodeUrl"]).toBe("");
  });

  it("throws on a non-2xx HTTP response with status code in the message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => '{"error":{"message":"Invalid request"}}',
      }),
    );
    const gateway = buildGateway();
    await expect(gateway.createCharge(CHARGE_INPUT)).rejects.toThrow(/422/);
  });
});

describe("StripeGateway.createCharge — unsupported method", () => {
  it("throws when method is CREDIT_CARD", async () => {
    const gateway = buildGateway();
    await expect(
      gateway.createCharge({
        ...CHARGE_INPUT,
        method: "CREDIT_CARD",
      }),
    ).rejects.toThrow(/does not support/i);
  });

  it("throws when method is BOLETO", async () => {
    const gateway = buildGateway();
    await expect(
      gateway.createCharge({
        ...CHARGE_INPUT,
        method: "BOLETO",
      }),
    ).rejects.toThrow(/does not support/i);
  });
});

describe("StripeGateway.cancelCharge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls POST /payment_intents/:id/cancel", async () => {
    mockFetch({});
    const gateway = buildGateway();
    await gateway.cancelCharge("pi_test_123");
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.stripe.com/v1/payment_intents/pi_test_123/cancel",
    );
    expect(options.method).toBe("POST");
  });

  it("sends the correct Authorization header on cancel", async () => {
    mockFetch({});
    const gateway = buildGateway();
    await gateway.cancelCharge("pi_test_456");
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("throws on a non-2xx response during cancel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '{"error":{"message":"No such payment_intent"}}',
      }),
    );
    const gateway = buildGateway();
    await expect(gateway.cancelCharge("pi_notfound")).rejects.toThrow(/404/);
  });
});
