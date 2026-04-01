import { z } from "zod";

export const CreateWorkloadMetricSchema = z.object({
  athleteId: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be ISO date format YYYY-MM-DD"),
  rpe: z.number().int().min(1, "RPE minimum is 1").max(10, "RPE maximum is 10"),
  durationMinutes: z
    .number()
    .int()
    .positive("durationMinutes must be positive")
    .max(480, "durationMinutes cannot exceed 480 (8 hours)"),
  sessionType: z
    .enum(["MATCH", "TRAINING", "GYM", "RECOVERY", "OTHER"])
    .default("TRAINING"),
  notes: z.string().max(500).optional(),
  /**
   * Client-generated 32-char hex ID from the PWA offline sync queue.
   * Used as an idempotency key — the server returns the existing record
   * without creating a duplicate when the same key is submitted twice.
   * Optional: sessions created outside the PWA (e.g. direct API calls)
   * may omit this field.
   */
  idempotencyKey: z
    .string()
    .regex(
      /^[0-9a-f]{32}$/,
      "idempotencyKey must be a 32-character lowercase hex string",
    )
    .optional(),
});

export const AcwrQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(28),
});

export const AttendanceRankingQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
  sessionType: z
    .enum(["MATCH", "TRAINING", "GYM", "RECOVERY", "OTHER"])
    .optional(),
});

export type CreateWorkloadMetricInput = z.infer<
  typeof CreateWorkloadMetricSchema
>;
export type AcwrQuery = z.infer<typeof AcwrQuerySchema>;
export type AttendanceRankingQuery = z.infer<
  typeof AttendanceRankingQuerySchema
>;

export type RiskZone =
  | "insufficient_data"
  | "low"
  | "optimal"
  | "high"
  | "very_high";

export interface AcwrEntry {
  date: Date;
  dailyAu: number;
  acuteLoadAu: number;
  chronicLoadAu: number;
  acuteWindowDays: number;
  chronicWindowDays: number;
  acwrRatio: number | null;
  riskZone: RiskZone;
}

export interface AcwrResponse {
  athleteId: string;
  latest: AcwrEntry | null;
  history: AcwrEntry[];
}

export interface WorkloadMetricResponse {
  id: string;
  athleteId: string;
  date: Date;
  rpe: number;
  durationMinutes: number;
  trainingLoadAu: number;
  sessionType: string;
  notes: string | null;
  createdAt: Date;
}

export interface AthleteAttendanceRank {
  athleteId: string;
  name: string;
  position: string | null;
  sessionCount: number;
  trainingDays: number;
  lastSessionDate: Date | null;
  acwrRatio: number | null;
  riskZone: RiskZone | null;
}

export interface AttendanceRankingResponse {
  athletes: AthleteAttendanceRank[];
  windowDays: number;
  /** ISO timestamp of the last ACWR refresh — null if view has no data */
  acwrLastRefreshedAt: Date | null;
}
