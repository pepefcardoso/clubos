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

/**
 * Thrown by PaymentGateway.parseWebhook() when the request signature
 * does not match the expected HMAC / shared secret.
 *
 * Caught by the webhook route handler → HTTP 401.
 */
export class WebhookSignatureError extends Error {
  constructor(gatewayName: string) {
    super(`Invalid webhook signature from gateway "${gatewayName}"`);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Provider-agnostic normalised event returned by parseWebhook().
 *
 * Business-layer handlers (T-027 onwards) only need to deal with
 * this shape — never with provider-specific payloads.
 */
export interface WebhookEvent {
  /** Normalised event type understood by the business layer. */
  type: "PAYMENT_RECEIVED" | "PAYMENT_REFUNDED" | "PAYMENT_OVERDUE" | "UNKNOWN";
  /**
   * The gateway's own transaction / charge identifier.
   * Stored as `gatewayTxid` in the Payment row for idempotency checks (T-028).
   */
  gatewayTxId: string;
  /**
   * The internal ClubOS charge ID echoed back by the gateway
   * (set as `externalReference` / `idempotencyKey` when creating the charge).
   */
  externalReference?: string | undefined;
  /** Amount paid in cents (may be absent for non-payment events). */
  amountCents?: number | undefined;
  /** Original raw payload, preserved for audit / debugging. */
  rawPayload: unknown;
}

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
   *   PIX    → { qrCodeBase64, pixCopyPaste, expiresAt }
   *   Card   → { checkoutUrl }
   *   Boleto → { barCode, pdfUrl, expiresAt }
   */
  meta: Record<string, unknown>;
}

export interface PaymentGateway {
  readonly name: string;
  readonly supportedMethods: ReadonlyArray<PaymentMethod>;

  createCharge(input: CreateChargeInput): Promise<ChargeResult>;

  cancelCharge(externalId: string): Promise<void>;

  /**
   * Validates the webhook signature and returns a normalised WebhookEvent.
   *
   * THROWS WebhookSignatureError if the signature is invalid or missing.
   * THROWS a generic Error for unexpected parse failures (→ 500).
   *
   * @param rawBody  Raw request body as Buffer (before any JSON.parse).
   *                 The webhook route captures it via addContentTypeParser.
   * @param headers  Full request headers map from the Fastify request.
   */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): WebhookEvent;
}
