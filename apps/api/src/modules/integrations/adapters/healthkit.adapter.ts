import type { z } from "zod";
import type {
  HealthKitPayloadSchema,
  NormalizedWorkloadPayload,
} from "../integrations.schema.js";

const HK_SESSION_TYPE_MAP: Record<
  string,
  NormalizedWorkloadPayload["sessionType"]
> = {
  HKWorkoutActivityTypeRunning: "TRAINING",
  HKWorkoutActivityTypeFootball: "TRAINING",
  HKWorkoutActivityTypeSoccer: "TRAINING",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "GYM",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "GYM",
  HKWorkoutActivityTypeCooldown: "RECOVERY",
  HKWorkoutActivityTypeFlexibility: "RECOVERY",
};

export function normalizeHealthKitPayload(
  raw: z.infer<typeof HealthKitPayloadSchema>,
): NormalizedWorkloadPayload {
  const startDate = new Date(raw.startDate);
  const date = startDate.toISOString().slice(0, 10);
  const durationMinutes = Math.max(1, Math.round(raw.duration / 60));
  const sessionType = HK_SESSION_TYPE_MAP[raw.workoutActivityType] ?? "OTHER";

  return {
    athleteId: raw.athleteId,
    date,
    rpe: raw.rpe,
    durationMinutes,
    sessionType,
    idempotencyKey: raw.idempotencyKey,
    sourceProvider: "healthkit",
  };
}
