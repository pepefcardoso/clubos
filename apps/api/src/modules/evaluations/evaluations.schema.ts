import { z } from "zod";

/** Shared validation for a single 1–5 criterion score. */
const scoreField = () =>
  z.number().int().min(1, "Nota mínima é 1").max(5, "Nota máxima é 5");

export const CreateEvaluationSchema = z.object({
  athleteId: z.string().min(1, "athleteId is required"),
  /**
   * ISO week string identifying the training microcycle.
   * Format: YYYY-Www (e.g. "2025-W03").
   * Week numbers are zero-padded to 2 digits.
   */
  microcycle: z
    .string()
    .regex(
      /^\d{4}-W\d{2}$/,
      "microcycle must be ISO week format: YYYY-Www (e.g. 2025-W03)",
    ),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  technique: scoreField(),
  tactical: scoreField(),
  physical: scoreField(),
  mental: scoreField(),
  attitude: scoreField(),
  notes: z.string().max(1000).optional(),
});

export const UpdateEvaluationSchema = z.object({
  technique: scoreField().optional(),
  tactical: scoreField().optional(),
  physical: scoreField().optional(),
  mental: scoreField().optional(),
  attitude: scoreField().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const ListEvaluationsQuerySchema = z.object({
  athleteId: z.string().optional(),
  microcycle: z.string().optional(),
  /** ISO date string — lower bound of the evaluation date range (inclusive). */
  from: z.iso.date().optional(),
  /** ISO date string — upper bound of the evaluation date range (inclusive). */
  to: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateEvaluationInput = z.infer<typeof CreateEvaluationSchema>;
export type UpdateEvaluationInput = z.infer<typeof UpdateEvaluationSchema>;
export type ListEvaluationsQuery = z.infer<typeof ListEvaluationsQuerySchema>;

export interface EvaluationResponse {
  id: string;
  athleteId: string;
  athleteName: string;
  microcycle: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  technique: number;
  tactical: number;
  physical: number;
  mental: number;
  attitude: number;
  /** Mean of the five criteria scores, rounded to 2 decimal places. */
  averageScore: number;
  notes: string | null;
  actorId: string;
  createdAt: string;
  updatedAt: string;
}
