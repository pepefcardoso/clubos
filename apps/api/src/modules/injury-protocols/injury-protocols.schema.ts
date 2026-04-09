import { z } from "zod";

export const ListInjuryProtocolsQuerySchema = z.object({
  structure: z.string().optional(),
  grade: z.enum(["GRADE_1", "GRADE_2", "GRADE_3", "COMPLETE"]).optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListInjuryProtocolsQuery = z.infer<
  typeof ListInjuryProtocolsQuerySchema
>;

export interface InjuryProtocolResponse {
  id: string;
  name: string;
  structure: string;
  grade: string;
  durationDays: number;
  source: string;
  steps: Array<{ day: string; activity: string }>;
  isActive: boolean;
  createdAt: string;
}

export interface InjuryProtocolSummary {
  id: string;
  name: string;
  structure: string;
  grade: string;
  durationDays: number;
  isActive: boolean;
}
