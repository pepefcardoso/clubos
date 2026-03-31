import { z } from "zod";

export const EXERCISE_CATEGORIES = [
  "STRENGTH",
  "CARDIO",
  "TECHNICAL",
  "TACTICAL",
  "RECOVERY",
  "OTHER",
] as const;

export const CreateExerciseSchema = z
  .object({
    name: z.string().min(2).max(120),
    description: z.string().max(1000).optional(),
    category: z.enum(EXERCISE_CATEGORIES).default("OTHER"),
    muscleGroups: z.array(z.string().max(60)).max(10).default([]),
  })
  .strip();

export const UpdateExerciseSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    description: z.string().max(1000).nullable().optional(),
    category: z.enum(EXERCISE_CATEGORIES).optional(),
    muscleGroups: z.array(z.string().max(60)).max(10).optional(),
    isActive: z.boolean().optional(),
  })
  .strip();

export const ListExercisesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  includeInactive: z.coerce.boolean().default(false),
});

export type CreateExerciseInput = z.infer<typeof CreateExerciseSchema>;
export type UpdateExerciseInput = z.infer<typeof UpdateExerciseSchema>;
export type ListExercisesQuery = z.infer<typeof ListExercisesQuerySchema>;

export interface ExerciseResponse {
  id: string;
  name: string;
  description: string | null;
  category: string;
  muscleGroups: string[];
  isActive: boolean;
  createdAt: Date;
}
