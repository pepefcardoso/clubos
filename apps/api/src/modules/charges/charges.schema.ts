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

export interface ChargeGenerationResult {
  generated: number;
  skipped: number;
  errors: Array<{ memberId: string; reason: string }>;
  charges: GeneratedChargeSummary[];
}

export interface GeneratedChargeSummary {
  chargeId: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  dueDate: Date;
}
