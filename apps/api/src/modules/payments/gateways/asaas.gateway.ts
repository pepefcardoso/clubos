import crypto from "node:crypto";
import type {
  PaymentGateway,
  PaymentMethod,
  CreateChargeInput,
  ChargeResult,
  WebhookEvent,
} from "../gateway.interface.ts";

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
  payment: {
    id: string;
    nossoNumero?: string;
    value: number;
    paymentDate?: string;
    status: string;
    description?: string;
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

const ASAAS_EVENT_MAP: Record<string, WebhookEvent["type"]> = {
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  PAYMENT_CONFIRMED: "PAYMENT_RECEIVED",
  PAYMENT_OVERDUE: "PAYMENT_OVERDUE",
  PAYMENT_DELETED: "PAYMENT_CANCELLED",
  PAYMENT_REFUNDED: "PAYMENT_REFUNDED",
  PAYMENT_CHARGEBACK_REQUESTED: "PAYMENT_CANCELLED",
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

    const response = await this.request<AsaasChargeResponse>(
      "POST",
      "/payments",
      payload,
    );

    return {
      externalId: response.id,
      status: this.normalizeStatus(response.status),
      meta: this.buildMeta(input.method, response),
    };
  }

  private async request<T>(
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

  async cancelCharge(externalId: string): Promise<void> {
    await this.request("DELETE", `/payments/${externalId}`);
  }

  async parseWebhook(
    payload: unknown,
    signature: string,
  ): Promise<WebhookEvent> {
    this.validateSignature(payload, signature);

    const body = payload as AsaasWebhookPayload;
    const eventType = ASAAS_EVENT_MAP[body.event];

    if (!eventType) {
      throw new Error(`AsaasGateway: unrecognised event type "${body.event}"`);
    }

    return {
      type: eventType,
      externalId: body.payment.id,
      gatewayTxid: body.payment.nossoNumero ?? body.payment.id,
      amountCents: Math.round(body.payment.value * 100),
      paidAt: body.payment.paymentDate
        ? new Date(body.payment.paymentDate)
        : undefined,
    };
  }

  private validateSignature(payload: unknown, signature: string): void {
    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest("hex");

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );

    if (!isValid) {
      throw new Error("AsaasGateway: invalid webhook signature");
    }
  }

  private normalizeStatus(asaasStatus: string): ChargeResult["status"] {
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
  private buildMeta(
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
      return {
        invoiceUrl: response.invoiceUrl,
      };
    }

    return {};
  }
}
