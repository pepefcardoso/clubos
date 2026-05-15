import { z } from "zod";

export const RespondContactRequestSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT"]),
  reason: z
    .string()
    .max(500, "Motivo deve ter no máximo 500 caracteres.")
    .optional(),
});

export type RespondContactRequestInput = z.infer<
  typeof RespondContactRequestSchema
>;
