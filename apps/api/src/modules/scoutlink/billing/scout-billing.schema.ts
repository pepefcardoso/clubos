import { z } from "zod";

export const SubscribeScoutSchema = z.object({}).strict();

export type SubscribeScoutBody = z.infer<typeof SubscribeScoutSchema>;

export interface HandleScoutBillingPaymentInput {
  scoutId: string;
  billingCycle: string;
  gatewayTxId: string;
  amountCents: number;
  paidAt: Date;
  externalId?: string | null;
  gatewayName?: string | null;
}
