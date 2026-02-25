import { z } from "zod";
import type { PlanInterval } from "../../../generated/prisma/index.js";

export const PlanIntervalSchema = z.enum(["monthly", "quarterly", "annual"]);

export const CreatePlanSchema = z.object({
  name: z.string().min(2).max(80),
  priceCents: z
    .number()
    .int("priceCents must be an integer (cents, no decimals)")
    .positive("priceCents must be greater than 0"),
  interval: PlanIntervalSchema.default("monthly"),
  benefits: z.array(z.string().min(1).max(120)).default([]),
});

export const UpdatePlanSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  priceCents: z
    .number()
    .int("priceCents must be an integer (cents, no decimals)")
    .positive("priceCents must be greater than 0")
    .optional(),
  interval: PlanIntervalSchema.optional(),
  benefits: z.array(z.string().min(1).max(120)).optional(),
  isActive: z.boolean().optional(),
});

export const ListPlansQuerySchema = z.object({
  activeOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
export type ListPlansQuery = z.infer<typeof ListPlansQuerySchema>;

export interface PlanResponse {
  id: string;
  name: string;
  priceCents: number;
  interval: PlanInterval;
  benefits: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
