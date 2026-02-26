import { z } from "zod";

export const GenerateMonthlyChargesSchema = z.object({
  /**
   * Target billing period. Defaults to the current month if omitted.
   * ISO date string — only year and month are used (day is ignored).
   * Example: "2025-03-01T00:00:00.000Z"
   */
  billingPeriod: z.iso.datetime().optional(),

  /**
   * Override the default due date (last day of billing month).
   * ISO date string. Must fall within the billing month.
   */
  dueDate: z.iso.datetime().optional(),
});

export type GenerateMonthlyChargesInput = z.infer<
  typeof GenerateMonthlyChargesSchema
>;

/** Subset of ChargeResult.meta specific to PIX charges (Asaas). */
export interface PixGatewayMeta {
  qrCodeBase64: string;
  pixCopyPaste: string;
}

/**
 * Union of all known gatewayMeta shapes. Extend as new payment methods / providers
 * are added. The `Record<string, never>` branch covers CASH / BANK_TRANSFER
 * (offline methods that produce no gateway data).
 */
export type GatewayMeta =
  | PixGatewayMeta
  | { bankSlipUrl?: string; invoiceUrl?: string }
  | { invoiceUrl?: string }
  | Record<string, never>;

export interface ChargeGenerationResult {
  generated: number;
  skipped: number;
  errors: Array<{ memberId: string; reason: string }>;
  /**
   * Gateway-level errors collected during charge dispatch.
   * A non-empty list here means some charges were persisted as PENDING
   * but the gateway call (or the subsequent DB update) failed.
   * T-024 retry logic will pick them up.
   */
  gatewayErrors: Array<{ chargeId: string; memberId: string; reason: string }>;
  charges: GeneratedChargeSummary[];
}

export interface GeneratedChargeSummary {
  chargeId: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  dueDate: Date;
  /**
   * Populated only when gateway dispatch succeeded.
   * Callers (e.g. the T-025 HTTP endpoint, T-023 BullMQ job) can read the
   * QR code or payment link here without a second DB round-trip.
   */
  gatewayMeta?: GatewayMeta;
  externalId?: string;
  gatewayName?: string;
}
