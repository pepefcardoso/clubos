import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  PaymentGateway,
  PaymentMethod,
  CreateChargeInput,
  ChargeResult,
  WebhookEvent,
} from "../gateway.interface.js";
import { WebhookSignatureError } from "../gateway.interface.js";

interface StripePixQrCode {
  data: string;
  image_url_png: string;
}

interface StripePaymentIntentResponse {
  id: string;
  status: string;
  amount: number;
  latest_charge?: string;
  metadata: Record<string, string>;
  next_action?: {
    type: string;
    pix_display_qr_code?: StripePixQrCode;
  };
}

interface StripeWebhookPayload {
  type: string;
  data: {
    object: {
      id: string;
      amount?: number;
      latest_charge?: string;
      metadata?: Record<string, string>;
    };
  };
}

const STRIPE_EVENT_TYPE_MAP: Record<string, WebhookEvent["type"]> = {
  "payment_intent.succeeded": "PAYMENT_RECEIVED",
  "charge.refunded": "PAYMENT_REFUNDED",
};

/**
 * Replay-protection tolerance in seconds — aligned with security-guidelines.md §5.
 * Stripe recommends ±5 minutes (300 s).
 */
const TIMESTAMP_TOLERANCE_SECONDS = 300;

export class StripeGateway implements PaymentGateway {
  readonly name = "stripe";

  readonly supportedMethods: ReadonlyArray<PaymentMethod> = ["PIX"];

  private readonly baseUrl = "https://api.stripe.com/v1";
  private readonly secretKey: string;
  private readonly webhookSecret: string;

  constructor(config: { secretKey: string; webhookSecret: string }) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    if (input.method !== "PIX") {
      throw new Error(
        `StripeGateway does not support method "${input.method}"`,
      );
    }

    const params = new URLSearchParams({
      amount: String(input.amountCents),
      currency: "brl",
      "payment_method_types[]": "pix",
      "payment_method_data[type]": "pix",
      confirm: "true",
      "metadata[idempotencyKey]": input.idempotencyKey,
      "metadata[externalReference]": input.idempotencyKey,
    });

    if (input.description) {
      params.set("description", input.description);
    }

    const response = await this._request<StripePaymentIntentResponse>(
      "POST",
      "/payment_intents",
      params,
      input.idempotencyKey,
    );

    const qrCode = response.next_action?.pix_display_qr_code;

    return {
      externalId: response.id,
      status: this._normalisePaymentIntentStatus(response.status),
      meta: {
        pixCopyPaste: qrCode?.data ?? "",
        qrCodeUrl: qrCode?.image_url_png ?? "",
        paymentIntentId: response.id,
      },
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    await this._request(
      "POST",
      `/payment_intents/${externalId}/cancel`,
      new URLSearchParams(),
    );
  }

  /**
   * Validates the Stripe webhook signature and returns a normalised event.
   *
   * Stripe's signature scheme:
   *   stripe-signature: t=<unix_ts>,v1=<hex_hmac>[,v0=<oldsig>]
   *
   * Signed payload: "${t}.${rawBodyAsString}"
   * HMAC key: webhookSecret (whsec_...)
   *
   * Replay-protection: rejects events where |now - t| > TIMESTAMP_TOLERANCE_SECONDS.
   *
   * THROWS WebhookSignatureError → route returns 401 (invalid/missing sig or stale timestamp)
   * THROWS generic Error          → route returns 500 (unexpected parse failure)
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookEvent {
    const sigHeader = this._extractHeader(headers, "stripe-signature");
    const { timestamp, v1Sig } = this._parseSigHeader(sigHeader);

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
      throw new WebhookSignatureError(this.name);
    }

    const signedPayload = `${timestamp}.${rawBody.toString("utf-8")}`;
    const expectedSig = createHmac("sha256", this.webhookSecret)
      .update(signedPayload)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSig, "utf-8");
    const receivedBuf = Buffer.from(v1Sig, "utf-8");

    const valid =
      expectedBuf.length === receivedBuf.length &&
      timingSafeEqual(expectedBuf, receivedBuf);

    if (!valid) {
      throw new WebhookSignatureError(this.name);
    }

    let payload: StripeWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString("utf-8")) as StripeWebhookPayload;
    } catch {
      throw new Error("StripeGateway: failed to parse webhook body as JSON");
    }

    const obj = payload.data.object;
    const gatewayTxId = obj.latest_charge ?? obj.id ?? "";

    return {
      type: STRIPE_EVENT_TYPE_MAP[payload.type] ?? "UNKNOWN",
      gatewayTxId,
      externalReference: obj.metadata?.["idempotencyKey"] ?? undefined,
      amountCents: obj.amount ?? undefined,
      rawPayload: payload,
    };
  }

  /**
   * Parses the stripe-signature header: "t=<ts>,v1=<sig>[,v0=<oldsig>]"
   * Throws WebhookSignatureError if the header is malformed or missing v1/t.
   */
  private _parseSigHeader(header: string): {
    timestamp: number;
    v1Sig: string;
  } {
    const parts = header.split(",");
    let timestamp = 0;
    let v1Sig = "";

    for (const part of parts) {
      const eqIndex = part.indexOf("=");
      if (eqIndex === -1) continue;
      const key = part.slice(0, eqIndex);
      const value = part.slice(eqIndex + 1);
      if (key === "t") timestamp = parseInt(value, 10);
      if (key === "v1" && !v1Sig) v1Sig = value;
    }

    if (!timestamp || !v1Sig) {
      throw new WebhookSignatureError(this.name);
    }

    return { timestamp, v1Sig };
  }

  private _extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string {
    const value = headers[name];
    if (Array.isArray(value)) return value[0] ?? "";
    return value ?? "";
  }

  private _normalisePaymentIntentStatus(
    status: string,
  ): ChargeResult["status"] {
    switch (status) {
      case "succeeded":
        return "PAID";
      case "canceled":
        return "CANCELLED";
      default:
        return "PENDING";
    }
  }

  private async _request<T = void>(
    method: string,
    path: string,
    body?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined && { body: body.toString() }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`StripeGateway request failed [${res.status}]: ${text}`);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }
}
