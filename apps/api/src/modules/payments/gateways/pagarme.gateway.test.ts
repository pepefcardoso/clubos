import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PagarmeGateway } from "./pagarme.gateway.js";
import { WebhookSignatureError } from "../gateway.interface.js";

const WEBHOOK_SECRET = "super-secret-pagarme-token-32chars!";

function buildGateway(): PagarmeGateway {
  return new PagarmeGateway({
    apiKey: "test-api-key",
    webhookSecret: WEBHOOK_SECRET,
    sandbox: true,
  });
}

/** Computes the valid HMAC-SHA256 hex signature over a JSON body. */
function sign(body: object): string {
  const raw = JSON.stringify(body);
  return createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
}

/** Returns headers containing the correct signature for the given payload. */
function validHeaders(body: object): Record<string, string> {
  return { "x-pagarme-signature": sign(body) };
}

function rawBody(payload: object): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf-8");
}

const ORDER_PAID_PAYLOAD = {
  type: "order.paid",
  data: {
    id: "or_abc123",
    code: "charge-internal-001",
    charges: [
      {
        id: "ch_abc123",
        amount: 9900,
        last_transaction: {
          id: "tran_abc123",
        },
      },
    ],
  },
};

const CHARGE_PAID_PAYLOAD = {
  type: "charge.paid",
  data: {
    id: "or_xyz",
    code: "charge-internal-002",
    charges: [
      {
        id: "ch_xyz",
        amount: 4990,
        last_transaction: { id: "tran_xyz" },
      },
    ],
  },
};

describe("PagarmeGateway.parseWebhook — signature validation", () => {
  it("accepts a request with the correct HMAC-SHA256 x-pagarme-signature header", () => {
    const gateway = buildGateway();
    const event = gateway.parseWebhook(
      rawBody(ORDER_PAID_PAYLOAD),
      validHeaders(ORDER_PAID_PAYLOAD),
    );
    expect(event).toBeDefined();
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("throws WebhookSignatureError when the signature header is missing", () => {
    const gateway = buildGateway();
    expect(() => gateway.parseWebhook(rawBody(ORDER_PAID_PAYLOAD), {})).toThrow(
      WebhookSignatureError,
    );
  });

  it("throws WebhookSignatureError when the signature is wrong", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(ORDER_PAID_PAYLOAD), {
        "x-pagarme-signature": "deadbeef00000000",
      }),
    ).toThrow(WebhookSignatureError);
  });

  it("throws WebhookSignatureError when the signature is an empty string", () => {
    const gateway = buildGateway();
    expect(() =>
      gateway.parseWebhook(rawBody(ORDER_PAID_PAYLOAD), {
        "x-pagarme-signature": "",
      }),
    ).toThrow(WebhookSignatureError);
  });

  it('WebhookSignatureError.message includes "pagarme"', () => {
    const gateway = buildGateway();
    let caught: unknown;
    try {
      gateway.parseWebhook(rawBody(ORDER_PAID_PAYLOAD), {
        "x-pagarme-signature": "badsig",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WebhookSignatureError);
    expect((caught as WebhookSignatureError).message).toContain("pagarme");
  });

  it("accepts an array header value (multi-value headers)", () => {
    const gateway = buildGateway();
    const sig = sign(ORDER_PAID_PAYLOAD);
    const event = gateway.parseWebhook(rawBody(ORDER_PAID_PAYLOAD), {
      "x-pagarme-signature": [sig, "extra-value"],
    } as Record<string, string[]>);
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });
});

describe("PagarmeGateway.parseWebhook — event type normalisation", () => {
  let gateway: PagarmeGateway;

  beforeEach(() => {
    gateway = buildGateway();
  });

  it("order.paid → PAYMENT_RECEIVED", () => {
    const payload = { ...ORDER_PAID_PAYLOAD, type: "order.paid" };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("charge.paid → PAYMENT_RECEIVED", () => {
    const event = gateway.parseWebhook(
      rawBody(CHARGE_PAID_PAYLOAD),
      validHeaders(CHARGE_PAID_PAYLOAD),
    );
    expect(event.type).toBe("PAYMENT_RECEIVED");
  });

  it("charge.refunded → PAYMENT_REFUNDED", () => {
    const payload = { ...ORDER_PAID_PAYLOAD, type: "charge.refunded" };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.type).toBe("PAYMENT_REFUNDED");
  });

  it("charge.chargedback → PAYMENT_REFUNDED", () => {
    const payload = { ...ORDER_PAID_PAYLOAD, type: "charge.chargedback" };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.type).toBe("PAYMENT_REFUNDED");
  });

  it("charge.overdue → PAYMENT_OVERDUE", () => {
    const payload = { ...ORDER_PAID_PAYLOAD, type: "charge.overdue" };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.type).toBe("PAYMENT_OVERDUE");
  });

  it("order.payment_failed → UNKNOWN", () => {
    const payload = { ...ORDER_PAID_PAYLOAD, type: "order.payment_failed" };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.type).toBe("UNKNOWN");
  });

  it("unknown event string → UNKNOWN", () => {
    const payload = { ...ORDER_PAID_PAYLOAD, type: "order.created" };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.type).toBe("UNKNOWN");
  });
});

describe("PagarmeGateway.parseWebhook — WebhookEvent fields", () => {
  let gateway: PagarmeGateway;

  beforeEach(() => {
    gateway = buildGateway();
  });

  it("prefers last_transaction.id for gatewayTxId", () => {
    const event = gateway.parseWebhook(
      rawBody(ORDER_PAID_PAYLOAD),
      validHeaders(ORDER_PAID_PAYLOAD),
    );
    expect(event.gatewayTxId).toBe("tran_abc123");
  });

  it("falls back to charge.id when last_transaction is absent", () => {
    const payload = {
      type: "charge.paid",
      data: {
        id: "or_fallback",
        charges: [{ id: "ch_fallback", amount: 5000 }],
      },
    };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.gatewayTxId).toBe("ch_fallback");
  });

  it("falls back to data.id when no charges are present", () => {
    const payload = {
      type: "order.paid",
      data: { id: "or_nodatacharges" },
    };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.gatewayTxId).toBe("or_nodatacharges");
  });

  it("maps data.code to externalReference", () => {
    const event = gateway.parseWebhook(
      rawBody(ORDER_PAID_PAYLOAD),
      validHeaders(ORDER_PAID_PAYLOAD),
    );
    expect(event.externalReference).toBe("charge-internal-001");
  });

  it("externalReference is undefined when data.code is absent", () => {
    const payload = {
      type: "order.paid",
      data: {
        id: "or_nocode",
        charges: [
          {
            id: "ch_nocode",
            amount: 1000,
            last_transaction: { id: "tran_nocode" },
          },
        ],
      },
    };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.externalReference).toBeUndefined();
  });

  it("reads amountCents from charge.amount (already in cents, no conversion)", () => {
    const event = gateway.parseWebhook(
      rawBody(ORDER_PAID_PAYLOAD),
      validHeaders(ORDER_PAID_PAYLOAD),
    );
    expect(event.amountCents).toBe(9900);
  });

  it("converts float data.amount to cents when no charges are present", () => {
    const payload = {
      type: "order.paid",
      data: { id: "or_topamt", amount: 149.9 },
    };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.amountCents).toBe(14990);
  });

  it("amountCents is undefined when neither charge.amount nor data.amount is present", () => {
    const payload = {
      type: "charge.overdue",
      data: { id: "or_noamt", charges: [{ id: "ch_noamt" }] },
    };
    const event = gateway.parseWebhook(rawBody(payload), validHeaders(payload));
    expect(event.amountCents).toBeUndefined();
  });

  it("includes rawPayload with the parsed JSON object", () => {
    const event = gateway.parseWebhook(
      rawBody(ORDER_PAID_PAYLOAD),
      validHeaders(ORDER_PAID_PAYLOAD),
    );
    expect(event.rawPayload).toMatchObject({ type: "order.paid" });
  });
});

describe("PagarmeGateway.createCharge — PIX", () => {
  let gateway: PagarmeGateway;

  const MOCK_ORDER_RESPONSE = {
    id: "or_neworder",
    code: "idem-key-001",
    status: "pending",
    charges: [
      {
        id: "ch_new001",
        amount: 9900,
        last_transaction: {
          id: "tran_new001",
          qr_code: "00020126580014br.gov.bcb.pix...",
          qr_code_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA",
        },
      },
    ],
  };

  beforeEach(() => {
    gateway = buildGateway();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("calls POST /orders with correct Basic Auth header", async () => {
    mockFetch(MOCK_ORDER_RESPONSE);
    await gateway.createCharge(CHARGE_INPUT);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toMatch(/^Basic /);
    expect(headers["Authorization"]).toBe("Basic dGVzdC1hcGkta2V5Og==");
  });

  it("sets code to the idempotencyKey in the request body", async () => {
    mockFetch(MOCK_ORDER_RESPONSE);
    await gateway.createCharge(CHARGE_INPUT);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(options.body as string);
    expect(body.code).toBe("idem-key-001");
  });

  it("calls the sandbox /orders endpoint", async () => {
    mockFetch(MOCK_ORDER_RESPONSE);
    await gateway.createCharge(CHARGE_INPUT);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("https://sandbox.pagarme.com/core/v5/orders");
  });

  it("returns externalId equal to the order id", async () => {
    mockFetch(MOCK_ORDER_RESPONSE);
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.externalId).toBe("or_neworder");
  });

  it("returns meta.qrCodeBase64 and meta.pixCopyPaste", async () => {
    mockFetch(MOCK_ORDER_RESPONSE);
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.meta["qrCodeBase64"]).toBe("iVBORw0KGgoAAAANSUhEUgAA");
    expect(result.meta["pixCopyPaste"]).toBe("00020126580014br.gov.bcb.pix...");
  });

  it("strips the data:image/png;base64, prefix from qr_code_url", async () => {
    mockFetch(MOCK_ORDER_RESPONSE);
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.meta["qrCodeBase64"]).not.toContain("data:image");
  });

  it("returns raw base64 unchanged when qr_code_url has no data URI prefix", async () => {
    const responseWithRawBase64 = {
      ...MOCK_ORDER_RESPONSE,
      charges: [
        {
          ...MOCK_ORDER_RESPONSE.charges[0],
          last_transaction: {
            ...MOCK_ORDER_RESPONSE.charges[0]!.last_transaction,
            qr_code_url: "rawbase64string==",
          },
        },
      ],
    };
    mockFetch(responseWithRawBase64);
    const result = await gateway.createCharge(CHARGE_INPUT);
    expect(result.meta["qrCodeBase64"]).toBe("rawbase64string==");
  });

  it("throws when order response contains no charges", async () => {
    mockFetch({ id: "or_empty", code: "x", status: "pending", charges: [] });
    await expect(gateway.createCharge(CHARGE_INPUT)).rejects.toThrow(
      /no charges/i,
    );
  });
});

describe("PagarmeGateway.createCharge — error handling", () => {
  let gateway: PagarmeGateway;

  beforeEach(() => {
    gateway = buildGateway();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a descriptive error on non-2xx HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => '{"message":"Unprocessable"}',
      }),
    );
    await expect(
      gateway.createCharge({
        amountCents: 1000,
        dueDate: new Date(),
        method: "PIX",
        customer: { name: "Test", cpf: "00000000000", phone: "11999990000" },
        idempotencyKey: "k1",
      }),
    ).rejects.toThrow(/422/);
  });

  it("throws on unsupported payment method (non-PIX)", async () => {
    await expect(
      gateway.createCharge({
        amountCents: 1000,
        dueDate: new Date(),
        method: "CREDIT_CARD",
        customer: { name: "Test", cpf: "00000000000", phone: "11999990000" },
        idempotencyKey: "k2",
      }),
    ).rejects.toThrow(/not yet implemented/i);
  });
});

describe("PagarmeGateway.parseWebhook — edge cases", () => {
  it("throws a generic Error (not WebhookSignatureError) for non-JSON body with valid signature", () => {
    const gateway = buildGateway();
    const nonJson = Buffer.from("not-valid-json", "utf-8");
    const sig = createHmac("sha256", WEBHOOK_SECRET)
      .update(nonJson)
      .digest("hex");
    expect(() =>
      gateway.parseWebhook(nonJson, { "x-pagarme-signature": sig }),
    ).toThrow(/failed to parse webhook body/i);
  });

  it("the parse error is NOT a WebhookSignatureError", () => {
    const gateway = buildGateway();
    const nonJson = Buffer.from("not-valid-json", "utf-8");
    const sig = createHmac("sha256", WEBHOOK_SECRET)
      .update(nonJson)
      .digest("hex");
    let caught: unknown;
    try {
      gateway.parseWebhook(nonJson, { "x-pagarme-signature": sig });
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(WebhookSignatureError);
  });

  it("does not throw for a minimal payload with an empty charges array", () => {
    const gateway = buildGateway();
    const payload = { type: "order.paid", data: { id: "or_min", charges: [] } };
    expect(() =>
      gateway.parseWebhook(rawBody(payload), validHeaders(payload)),
    ).not.toThrow();
  });

  it("does not throw for a payload with no charges key", () => {
    const gateway = buildGateway();
    const payload = { type: "charge.overdue", data: { id: "or_noc" } };
    expect(() =>
      gateway.parseWebhook(rawBody(payload), validHeaders(payload)),
    ).not.toThrow();
  });
});
