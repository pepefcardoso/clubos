import { z } from "zod";

export const RecordParentalConsentSchema = z.object({
  clubSlug: z.string().min(1).max(50),
  athleteName: z.string().min(2).max(120),
  guardianName: z.string().min(2).max(120),
  guardianPhone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos"),
  guardianRelationship: z.enum(["mae", "pai", "avo", "tio", "outro"]),
  consentVersion: z.string().regex(/^v\d+\.\d+$/, "Invalid consent version"),
});

export type RecordParentalConsentInput = z.infer<
  typeof RecordParentalConsentSchema
>;

export interface ConsentTokenPayload {
  consentId: string;
  clubId: string;
  issuedAt: string;
}

export interface RecordParentalConsentResponse {
  consentId: string;
  consentToken: string;
  issuedAt: string;
}
