import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentGateway,
  PaymentMethod,
  CreateChargeInput,
  ChargeResult,
  WebhookEvent,
} from "../gateway.interface.js";
import { WebhookSignatureError } from "../gateway.interface.js";

interface PagarmeCustomer {
  name: string;
  document: string;
  document_type: "CPF";
  phones: {
    mobile_phone: {
      country_code: string;
      area_code: string;
      number: string;
    };
  };
}

interface PagarmeOrderItem {
  amount: number;
  description: string;
  quantity: number;
  code: string;
}

interface PagarmeCreateOrderPayload {
  code: string;
  customer: PagarmeCustomer;
  items: PagarmeOrderItem[];
  payments: Array<{
    payment_method: "pix";
    pix: { expires_in: number };
  }>;
}

interface PagarmeOrderResponse {
  id: string;
  code: string;
  status: string;
  charges: Array<{
    id: string;
    amount: number;
    last_transaction: {
      id: string;
      /** PIX copy-paste string (EMV payload) */
      qr_code: string;
      /** data:image/png;base64,... or raw base64 */
      qr_code_url: string;
    };
  }>;
}

interface PagarmeWebhookPayload {
  type: string;
  data: {
    id: string;
    /** Our idempotencyKey echoed back as externalReference */
    code?: string;
    charges?: Array<{
      id: string;
      /** Amount already in cents */
      amount?: number;
      last_transaction?: { id: string };
    }>;
    /** Top-level amount (float BRL, present on some event types) */
    amount?: number;
  };
}

const PAGARME_EVENT_TYPE_MAP: Record<string, WebhookEvent["type"]> = {
  "order.paid": "PAYMENT_RECEIVED",
  "charge.paid": "PAYMENT_RECEIVED",
  "charge.refunded": "PAYMENT_REFUNDED",
  "charge.chargedback": "PAYMENT_REFUNDED",
  "charge.overdue": "PAYMENT_OVERDUE",
};

export class PagarmeGateway implements PaymentGateway {
  readonly name = "pagarme";

  /**
   * T-081 implements PIX only. CREDIT_CARD and BOLETO are declared here so
   * that T-082 / future tasks can enable them without interface changes.
   */
  readonly supportedMethods: ReadonlyArray<PaymentMethod> = [
    "PIX",
    "CREDIT_CARD",
    "BOLETO",
  ];

  private readonly baseUrl: string;
  /** Pre-computed Basic Auth header value: "Basic base64(apiKey:)" */
  private readonly authHeader: string;
  private readonly webhookSecret: string;

  constructor(config: {
    apiKey: string;
    webhookSecret: string;
    sandbox?: boolean;
  }) {
    this.authHeader =
      "Basic " + Buffer.from(`${config.apiKey}:`).toString("base64");
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.sandbox
      ? "https://sandbox.pagarme.com/core/v5"
      : "https://api.pagarme.com/core/v5";
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    if (input.method !== "PIX") {
      throw new Error(
        `PagarmeGateway: method "${input.method}" not yet implemented`,
      );
    }

    const [areaCode, phoneNumber] = this._splitPhone(input.customer.phone);

    const payload: PagarmeCreateOrderPayload = {
      code: input.idempotencyKey,
      customer: {
        name: input.customer.name,
        document: input.customer.cpf,
        document_type: "CPF",
        phones: {
          mobile_phone: {
            country_code: "55",
            area_code: areaCode,
            number: phoneNumber,
          },
        },
      },
      items: [
        {
          amount: input.amountCents,
          description: input.description ?? "Mensalidade ClubOS",
          quantity: 1,
          code: `${input.idempotencyKey}-item`,
        },
      ],
      payments: [
        {
          payment_method: "pix",
          pix: { expires_in: 86400 },
        },
      ],
    };

    const response = await this._request<PagarmeOrderResponse>(
      "POST",
      "/orders",
      payload,
    );

    const firstCharge = response.charges[0];
    if (!firstCharge) {
      throw new Error("PagarmeGateway: order response contained no charges");
    }

    const txn = firstCharge.last_transaction;

    const qrCodeBase64 = txn.qr_code_url.startsWith("data:image")
      ? (txn.qr_code_url.split(",")[1] ?? "")
      : txn.qr_code_url;

    return {
      externalId: response.id,
      status: this._normaliseOrderStatus(response.status),
      meta: {
        qrCodeBase64,
        pixCopyPaste: txn.qr_code,
        chargeId: firstCharge.id,
        transactionId: txn.id,
      },
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    await this._request("DELETE", `/orders/${externalId}`);
  }

  /**
   * Validates the Pagarme webhook signature and returns a normalised event.
   *
   * Pagarme v5 uses HMAC-SHA256: the expected signature is
   *   hex( HMAC-SHA256(webhookSecret, rawBody) )
   * sent in the "x-pagarme-signature" header.
   *
   * We compare with timingSafeEqual to prevent timing-based attacks.
   *
   * THROWS WebhookSignatureError  → route returns 401
   * THROWS generic Error          → route returns 500 (unexpected parse failure)
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookEvent {
    const receivedSig = this._extractHeader(headers, "x-pagarme-signature");

    const expectedSig = createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSig, "utf-8");
    const receivedBuf = Buffer.from(receivedSig, "utf-8");

    const valid =
      expectedBuf.length === receivedBuf.length &&
      timingSafeEqual(expectedBuf, receivedBuf);

    if (!valid) {
      throw new WebhookSignatureError(this.name);
    }

    let payload: PagarmeWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString("utf-8")) as PagarmeWebhookPayload;
    } catch {
      throw new Error("PagarmeGateway: failed to parse webhook body as JSON");
    }

    const firstCharge = payload.data.charges?.[0];

    const gatewayTxId =
      firstCharge?.last_transaction?.id ??
      firstCharge?.id ??
      payload.data.id ??
      "";

    const amountCents =
      firstCharge?.amount != null
        ? firstCharge.amount
        : payload.data.amount != null
          ? Math.round(payload.data.amount * 100)
          : undefined;

    return {
      type: PAGARME_EVENT_TYPE_MAP[payload.type] ?? "UNKNOWN",
      gatewayTxId,
      externalReference: payload.data.code ?? undefined,
      amountCents,
      rawPayload: payload,
    };
  }

  private _extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string {
    const value = headers[name];
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
  }

  private _normaliseOrderStatus(status: string): ChargeResult["status"] {
    switch (status) {
      case "paid":
        return "PAID";
      case "canceled":
      case "voided":
        return "CANCELLED";
      case "failed":
        return "CANCELLED";
      default:
        return "PENDING";
    }
  }

  /**
   * Splits a Brazilian phone number string into [areaCode, number].
   *
   * Member phones are stored as digit-only strings (no masks):
   *   11 digits → "11999990000" → ["11", "999990000"]
   *   10 digits → "1199990000"  → ["11", "99990000"]
   *    9 digits → "999990000"   → fallback ["11", "999990000"]
   *
   * Falls back to area code "11" for unparseable values so that the Pagarme
   * API call still succeeds (customer.phone is not used for authentication).
   */
  private _splitPhone(phone: string): [string, string] {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 10) {
      return [digits.slice(0, 2), digits.slice(2)];
    }
    return ["11", digits];
  }

  private async _request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, options);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PagarmeGateway request failed [${res.status}]: ${text}`);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }
}
