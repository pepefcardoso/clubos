import { z } from "zod";

export const ScoutRegisterBodySchema = z.object({
  name: z.string().min(2).max(120),
  email: z.email(),
  password: z.string().min(12, "A senha deve ter ao menos 12 caracteres"),
  specialization: z.string().max(100).optional(),
  targetPositions: z.array(z.string().max(50)).max(10).default([]),
  targetAgeRanges: z.array(z.string().max(20)).max(5).default([]),
  crmNumber: z.string().max(30).optional(),
});

export const ScoutLoginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type ScoutRegisterBody = z.infer<typeof ScoutRegisterBodySchema>;
export type ScoutLoginBody = z.infer<typeof ScoutLoginBodySchema>;
