import type {
  ChargeResult,
  CreateChargeInput,
  PaymentGateway,
  PaymentMethod,
  WebhookEvent,
} from "../gateway.interface.js";
import { WebhookSignatureError } from "../gateway.interface.js";

interface StonePaymentLinkResponse {
  id: string;
  status: string;
  link?: string;
}

export class StoneGateway implements PaymentGateway {
  readonly name = "stone";

  readonly supportedMethods: ReadonlyArray<PaymentMethod> = [
    "CREDIT_CARD",
    "DEBIT_CARD",
  ];

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: { apiKey: string; sandbox?: boolean }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.sandbox
      ? "https://sandbox-api.openbank.stone.com.br/api/v1"
      : "https://api.openbank.stone.com.br/api/v1";
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl}/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        amount: input.amountCents,
        description: input.description ?? "Venda PDV ClubOS",
        expires_in: 3600,
        metadata: { idempotencyKey: input.idempotencyKey },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `StoneGateway createCharge failed [${res.status}]: ${text}`,
      );
    }

    const data = (await res.json()) as StonePaymentLinkResponse;

    return {
      externalId: data.id,
      status: "PENDING",
      meta: { checkoutUrl: data.link ?? null },
    };
  }

  async cancelCharge(externalId: string, reason?: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/payment-links/${externalId}/cancel`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(
        `StoneGateway cancelCharge failed [${res.status}]: ${text}`,
      );
    }

    void reason;
  }

  parseWebhook(): WebhookEvent {
    throw new WebhookSignatureError(this.name);
  }
}
