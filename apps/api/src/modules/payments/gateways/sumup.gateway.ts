import type {
  ChargeResult,
  CreateChargeInput,
  PaymentGateway,
  PaymentMethod,
  WebhookEvent,
} from "../gateway.interface.js";
import { WebhookSignatureError } from "../gateway.interface.js";

interface SumupCheckoutResponse {
  id: string;
  status: string;
  checkout_url?: string;
}

export class SumupGateway implements PaymentGateway {
  readonly name = "sumup";

  readonly supportedMethods: ReadonlyArray<PaymentMethod> = [
    "CREDIT_CARD",
    "DEBIT_CARD",
  ];

  private readonly baseUrl = "https://api.sumup.com";
  private readonly apiKey: string;

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey;
  }

  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    const res = await fetch(`${this.baseUrl}/v0.1/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        checkout_reference: input.idempotencyKey,
        amount: input.amountCents / 100,
        currency: "BRL",
        description: input.description ?? "Venda PDV ClubOS",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `SumupGateway createCharge failed [${res.status}]: ${text}`,
      );
    }

    const data = (await res.json()) as SumupCheckoutResponse;

    return {
      externalId: data.id,
      status: "PENDING",
      meta: { checkoutUrl: data.checkout_url ?? null },
    };
  }

  async cancelCharge(externalId: string, reason?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v0.1/checkouts/${externalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(
        `SumupGateway cancelCharge failed [${res.status}]: ${text}`,
      );
    }

    void reason;
  }

  parseWebhook(): WebhookEvent {
    throw new WebhookSignatureError(this.name);
  }
}
