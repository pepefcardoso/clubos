import { z } from "zod";

export const CreateIntegrationTokenSchema = z
  .object({
    athleteId: z.string().min(1),
    label: z.string().min(2).max(100),
  })
  .strip();

export const NormalizedWorkloadPayloadSchema = z
  .object({
    athleteId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    rpe: z.number().int().min(1).max(10),
    durationMinutes: z.number().int().positive().max(480),
    sessionType: z
      .enum(["MATCH", "TRAINING", "GYM", "RECOVERY", "OTHER"])
      .default("TRAINING"),
    notes: z.string().max(500).optional(),
    idempotencyKey: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
    sourceProvider: z
      .enum(["healthkit", "google_fit", "manual", "unknown"])
      .default("unknown"),
  })
  .strip();

export type NormalizedWorkloadPayload = z.infer<
  typeof NormalizedWorkloadPayloadSchema
>;

export const HealthKitPayloadSchema = z
  .object({
    workoutActivityType: z.string(),
    duration: z.number().positive(),
    totalEnergyBurned: z.number().optional(),
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    athleteId: z.string().min(1),
    idempotencyKey: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
    rpe: z.number().int().min(1).max(10),
  })
  .strip();

export const GoogleFitPayloadSchema = z
  .object({
    activityType: z.number().int(),
    durationMillis: z.number().positive(),
    calories: z.number().optional(),
    startTimeMillis: z.number().int(),
    athleteId: z.string().min(1),
    idempotencyKey: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
    rpe: z.number().int().min(1).max(10),
  })
  .strip();

export type CreateIntegrationTokenInput = z.infer<
  typeof CreateIntegrationTokenSchema
>;
