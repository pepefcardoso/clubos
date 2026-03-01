/**
 * Provider-agnostic WhatsApp abstraction layer.
 *
 * Mirrors the payment gateway pattern:
 *   whatsapp.interface.ts  ←→  gateway.interface.ts
 *   whatsapp.registry.ts   ←→  gateway.registry.ts
 *   providers/zapi.*       ←→  gateways/asaas.*
 */

export interface SendMessageInput {
  /**
   * Recipient phone number in E.164 format WITHOUT the '+': "5511999990000"
   * Non-digit characters must be stripped before calling sendMessage().
   */
  phone: string;
  /** Rendered message body (already interpolated with member variables). */
  body: string;
  /**
   * Idempotency key — prevents duplicate sends on job retry.
   * Use the internal Message.id so retries map to the same persisted row.
   */
  idempotencyKey: string;
}

export interface SendMessageResult {
  /** Provider-specific message ID for status tracking. */
  providerMessageId: string;
  /** Full raw provider response — stored in AuditLog metadata for debugging. */
  rawResponse: Record<string, unknown>;
}

/**
 * Thrown by WhatsAppProvider implementations on any send failure.
 *
 * Callers distinguish between retriable errors (network timeouts, 5xx) and
 * non-retriable errors (auth 401/403) by inspecting the message or a subclass
 * — this base class represents any provider-level failure.
 */
export class WhatsAppProviderError extends Error {
  constructor(
    message: string,
    public readonly providerName: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
  }
}

export interface WhatsAppProvider {
  /**
   * Canonical provider name, e.g. "zapi" | "evolution".
   * Used in logs and Message/AuditLog metadata.
   */
  readonly name: string;

  /**
   * Sends a WhatsApp message to a single recipient.
   *
   * @throws {WhatsAppProviderError} on any provider-level failure.
   *   — Retriable: network timeouts, HTTP 5xx
   *   — Non-retriable: auth errors (401/403), malformed phone
   */
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
