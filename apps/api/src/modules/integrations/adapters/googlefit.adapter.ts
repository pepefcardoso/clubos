import type { z } from "zod";
import type {
  GoogleFitPayloadSchema,
  NormalizedWorkloadPayload,
} from "../integrations.schema.js";

// Google Fit activity integer codes (partial)
const GFIT_SESSION_TYPE_MAP: Record<
  number,
  NormalizedWorkloadPayload["sessionType"]
> = {
  9: "TRAINING",
  26: "GYM",
  29: "TRAINING",
  72: "TRAINING",
  93: "TRAINING",
  63: "RECOVERY",
  80: "RECOVERY",
};

export function normalizeGoogleFitPayload(
  raw: z.infer<typeof GoogleFitPayloadSchema>,
): NormalizedWorkloadPayload {
  const startDate = new Date(raw.startTimeMillis);
  const date = startDate.toISOString().slice(0, 10);
  const durationMinutes = Math.max(1, Math.round(raw.durationMillis / 60_000));
  const sessionType = GFIT_SESSION_TYPE_MAP[raw.activityType] ?? "OTHER";

  return {
    athleteId: raw.athleteId,
    date,
    rpe: raw.rpe,
    durationMinutes,
    sessionType,
    idempotencyKey: raw.idempotencyKey,
    sourceProvider: "google_fit",
  };
}
