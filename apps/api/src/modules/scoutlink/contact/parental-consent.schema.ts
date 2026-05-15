import { z } from "zod";

export const RecordParentalConsentSchema = z.object({
  guardianName: z.string().min(2).max(120),
  guardianCpf: z
    .string()
    .regex(/^\d{11}$/, "CPF deve ter exatamente 11 dígitos"),
});

export const ParentalConsentParamsSchema = z.object({
  athleteId: z.string().cuid2(),
});

export type RecordParentalConsentInput = z.infer<
  typeof RecordParentalConsentSchema
>;
