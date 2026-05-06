import { z } from "zod";

export const PosChargeInputSchema = z.object({
  productName: z.string().min(1).max(200),
  amountCents: z.number().int().positive(),
  /**
   * Preferred payment method. When CARD and mPOS fails, service falls back
   * to PIX automatically. When PIX, skips mPOS entirely.
   */
  method: z.enum(["CARD", "PIX"]).default("CARD"),
});

export type PosChargeInput = z.infer<typeof PosChargeInputSchema>;

export interface PosChargeResponse {
  saleId: string;
  eventId: string;
  productName: string;
  amountCents: number;
  paymentMethod: string;
  /** Present when a gateway was used (PIX QR or mPOS checkout URL). */
  gatewayMeta?: Record<string, unknown>;
  usedFallback: boolean;
}
