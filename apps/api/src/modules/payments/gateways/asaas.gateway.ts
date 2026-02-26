import { timingSafeEqual } from "node:crypto";
import type {
  PaymentGateway,
  PaymentMethod,
  CreateChargeInput,
  ChargeResult,
  WebhookEvent,
} from "../gateway.interface.js";
import { WebhookSignatureError } from "../gateway.interface.js";

interface AsaasChargePayload {
  customer?: string;
  billingType: string;
  value: number;
  dueDate: string;
  description?: string | undefined;
  externalReference?: string;
}

interface AsaasChargeResponse {
  id: string;
  status: string;
  billingType: string;
  pixQrCode?: {
    encodedImage: string;
    payload: string;
  };
  bankSlipUrl?: string;
  invoiceUrl?: string;
  dueDate: string;
}

interface AsaasWebhookPayload {
  event: string;
  payment?: {
    id: string;
    nossoNumero?: string;
    externalReference?: string;
    value?: number;
    paymentDate?: string;
    status?: string;
  };
}

const METHOD_TO_ASAAS_BILLING: Record<PaymentMethod, string | null> = {
  PIX: "PIX",
  CREDIT_CARD: "CREDIT_CARD",
  DEBIT_CARD: "DEBIT_CARD",
  BOLETO: "BOLETO",
  CASH: null,
  BANK_TRANSFER: null,
};

/**
 * Maps Asaas event strings to the normalised WebhookEvent['type'] union.
 * Asaas emits both PAYMENT_RECEIVED and PAYMENT_CONFIRMED for successful
 * payments — both map to PAYMENT_RECEIVED in our domain.
 */
const ASAAS_EVENT_TYPE_MAP: Record<string, WebhookEvent["type"]> = {
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_CONFIRMED: "PAYMENT_RECEIVED",
  PAYMENT_REFUNDED: "PAYMENT_REFUNDED",
  PAYMENT_CHARGEBACK_REQUESTED: "PAYMENT_REFUNDED",
  PAYMENT_OVERDUE: "PAYMENT_OVERDUE",
};

export class AsaasGateway implements PaymentGateway {
  readonly name = "asaas";

  readonly supportedMethods: ReadonlyArray<PaymentMethod> = [
    "PIX",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "BOLETO",
  ];

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor(config: {
    apiKey: string;
    webhookSecret: string;
    sandbox?: boolean;
  }) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.baseUrl = config.sandbox
      ? "https://sandbox.asaas.com/api/v3"
      : "https://www.asaas.com/api/v3";
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const billingType = METHOD_TO_ASAAS_BILLING[input.method];
    if (!billingType) {
      throw new Error(`AsaasGateway does not support method "${input.method}"`);
    }

    const payload: AsaasChargePayload = {
      billingType,
      value: input.amountCents / 100,
      dueDate: input.dueDate.toISOString().split("T")[0]!,
      description: input.description,
      externalReference: input.idempotencyKey,
    };

    const response = await this._request<AsaasChargeResponse>(
      "POST",
      "/payments",
      payload,
    );

    return {
      externalId: response.id,
      status: this._normaliseChargeStatus(response.status),
      meta: this._buildMeta(input.method, response),
    };
  }

  async cancelCharge(externalId: string): Promise<void> {
    await this._request("DELETE", `/payments/${externalId}`);
  }

  /**
   * Validates the Asaas webhook signature and returns a normalised event.
   *
   * Asaas uses a shared-secret model: the configured ASAAS_WEBHOOK_SECRET is
   * sent verbatim in the "asaas-access-token" header with every request.
   * We compare with timingSafeEqual to prevent timing-based attacks.
   *
   * THROWS WebhookSignatureError  → route returns 401
   * THROWS generic Error          → route returns 500 (unexpected parse failure)
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookEvent {
    const receivedToken = this._extractHeader(headers, "asaas-access-token");

    const expectedBuf = Buffer.from(this.webhookSecret, "utf-8");
    const receivedBuf = Buffer.from(receivedToken, "utf-8");

    const valid =
      expectedBuf.length === receivedBuf.length &&
      timingSafeEqual(expectedBuf, receivedBuf);

    if (!valid) {
      throw new WebhookSignatureError(this.name);
    }

    const text = rawBody.toString("utf-8");
    let payload: AsaasWebhookPayload;
    try {
      payload = JSON.parse(text) as AsaasWebhookPayload;
    } catch {
      throw new Error(`AsaasGateway: failed to parse webhook body as JSON`);
    }

    return {
      type: this._normaliseEventType(payload.event),
      gatewayTxId: payload.payment?.nossoNumero ?? payload.payment?.id ?? "",
      externalReference: payload.payment?.externalReference ?? undefined,
      amountCents:
        payload.payment?.value != null
          ? Math.round(payload.payment.value * 100)
          : undefined,
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

  private _normaliseEventType(event: string): WebhookEvent["type"] {
    return ASAAS_EVENT_TYPE_MAP[event] ?? "UNKNOWN";
  }

  private _normaliseChargeStatus(asaasStatus: string): ChargeResult["status"] {
    switch (asaasStatus) {
      case "RECEIVED":
      case "CONFIRMED":
        return "PAID";
      case "CANCELLED":
      case "REFUNDED":
        return "CANCELLED";
      case "OVERDUE":
        return "OVERDUE";
      default:
        return "PENDING";
    }
  }

  /**
   * Builds the gatewayMeta JSON stored in charges.gatewayMeta.
   * Each method produces a different shape — consumers must check
   * charges.method before reading method-specific fields.
   */
  private _buildMeta(
    method: PaymentMethod,
    response: AsaasChargeResponse,
  ): Record<string, unknown> {
    if (method === "PIX" && response.pixQrCode) {
      return {
        qrCodeBase64: response.pixQrCode.encodedImage,
        pixCopyPaste: response.pixQrCode.payload,
      };
    }

    if (method === "BOLETO") {
      return {
        bankSlipUrl: response.bankSlipUrl,
        invoiceUrl: response.invoiceUrl,
      };
    }

    if (method === "CREDIT_CARD" || method === "DEBIT_CARD") {
      return { invoiceUrl: response.invoiceUrl };
    }

    return {};
  }

  private async _request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        access_token: this.apiKey,
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AsaasGateway request failed [${res.status}]: ${text}`);
    }

    return res.json() as Promise<T>;
  }
}
