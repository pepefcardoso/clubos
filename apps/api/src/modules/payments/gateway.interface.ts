/**
 * To add a new provider:
 *   1. Create `gateways/<provider>.gateway.ts` implementing PaymentGateway
 *   2. Register it in `gateways/index.ts`
 *   3. Done — no changes needed in ChargeService or webhook handlers
 */

export type PaymentMethod =
  | "PIX"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "BOLETO"
  | "BANK_TRANSFER";

export type ChargeExternalStatus = "PENDING" | "PAID" | "CANCELLED" | "OVERDUE";

export type WebhookEventType =
  | "PAYMENT_RECEIVED"
  | "PAYMENT_CANCELLED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_REFUNDED";

export interface GatewayCustomer {
  name: string;
  cpf: string;
  phone: string;
  email?: string | undefined;
}

export interface CreateChargeInput {
  amountCents: number;
  dueDate: Date;
  method: PaymentMethod;
  customer: GatewayCustomer;
  description?: string | undefined;
  idempotencyKey: string;
}

export interface ChargeResult {
  externalId: string;
  status: ChargeExternalStatus;
  /**
   * Provider-specific metadata stored as JSONB in charges.gatewayMeta.
   * Examples:
   *   PIX  → { qrCodeBase64, pixCopyPaste, expiresAt }
   *   Card → { checkoutUrl }
   *   Boleto → { barCode, pdfUrl, expiresAt }
   */
  meta: Record<string, unknown>;
}

export interface WebhookEvent {
  type: WebhookEventType;
  externalId: string;
  gatewayTxid: string;
  amountCents: number;
  paidAt?: Date | undefined;
  cancelReason?: string | undefined;
}

export interface PaymentGateway {
  readonly name: string;
  readonly supportedMethods: ReadonlyArray<PaymentMethod>;
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  cancelCharge(externalId: string): Promise<void>;
  parseWebhook(payload: unknown, signature: string): Promise<WebhookEvent>;
}
