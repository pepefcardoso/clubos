import { z } from "zod";

export const CreateContactRequestSchema = z.object({
  athleteId: z.string().min(1, "athleteId é obrigatório."),
  reason: z
    .string()
    .max(500, "Motivo deve ter no máximo 500 caracteres.")
    .optional(),
});

export type CreateContactRequestInput = z.infer<
  typeof CreateContactRequestSchema
>;
