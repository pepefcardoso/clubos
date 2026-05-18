import { z } from "zod";

export const TransferShowcaseBodySchema = z.object({
  targetClubId: z.string().min(1, "targetClubId é obrigatório."),
  consentHash: z.string().optional(),
});

export type TransferShowcaseBody = z.infer<typeof TransferShowcaseBodySchema>;
