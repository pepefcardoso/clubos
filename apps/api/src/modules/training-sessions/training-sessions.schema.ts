import { z } from "zod";

const SESSION_TYPES = [
  "MATCH",
  "TRAINING",
  "GYM",
  "RECOVERY",
  "OTHER",
] as const;

export const AddSessionExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  order: z.number().int().min(0).default(0),
  sets: z.number().int().positive().optional(),
  reps: z.number().int().positive().optional(),
  durationSeconds: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

export const CreateTrainingSessionSchema = z
  .object({
    title: z.string().min(2).max(200),
    scheduledAt: z
      .string()
      .datetime({ message: "scheduledAt must be an ISO 8601 datetime string" }),
    sessionType: z.enum(SESSION_TYPES).default("TRAINING"),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(480, "durationMinutes cannot exceed 480 (8 hours)"),
    notes: z.string().max(2000).optional(),
    exercises: z.array(AddSessionExerciseSchema).max(50).default([]),
  })
  .strip();

export const UpdateTrainingSessionSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    scheduledAt: z.iso
      .datetime({ message: "scheduledAt must be an ISO 8601 datetime string" })
      .optional(),
    sessionType: z.enum(SESSION_TYPES).optional(),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(480, "durationMinutes cannot exceed 480")
      .optional(),
    notes: z.string().max(2000).nullable().optional(),
    isCompleted: z.boolean().optional(),
  })
  .strip();

export const ListTrainingSessionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sessionType: z.enum(SESSION_TYPES).optional(),
  isCompleted: z.coerce.boolean().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export type CreateTrainingSessionInput = z.infer<
  typeof CreateTrainingSessionSchema
>;
export type UpdateTrainingSessionInput = z.infer<
  typeof UpdateTrainingSessionSchema
>;
export type ListTrainingSessionsQuery = z.infer<
  typeof ListTrainingSessionsQuerySchema
>;
export type AddSessionExerciseInput = z.infer<typeof AddSessionExerciseSchema>;

export interface SessionExerciseResponse {
  id: string;
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: string;
  order: number;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  notes: string | null;
}

export interface TrainingSessionResponse {
  id: string;
  title: string;
  scheduledAt: string;
  sessionType: string;
  durationMinutes: number;
  notes: string | null;
  isCompleted: boolean;
  exercises: SessionExerciseResponse[];
  createdAt: string;
}
