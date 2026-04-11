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

/**
 * Query params for the injury-load correlation endpoint.
 * days: look-back window for medical_records.occurredAt
 * minAcwr: minimum ACWR threshold to include a correlation event
 */
export const InjuryCorrelationQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(365).default(30),
  minAcwr: z.coerce.number().min(0.5).max(3.0).default(1.3),
});

/**
 * Query params for the at-risk athletes endpoint.
 * minAcwr: minimum ACWR ratio to classify an athlete as at-risk
 */
export const AtRiskAthletesQuerySchema = z.object({
  minAcwr: z.coerce.number().min(0.5).max(3.0).default(1.3),
});

export type CreateWorkloadMetricInput = z.infer<
  typeof CreateWorkloadMetricSchema
>;
export type AcwrQuery = z.infer<typeof AcwrQuerySchema>;
export type AttendanceRankingQuery = z.infer<
  typeof AttendanceRankingQuerySchema
>;
export type InjuryCorrelationQuery = z.infer<
  typeof InjuryCorrelationQuerySchema
>;
export type AtRiskAthletesQuery = z.infer<typeof AtRiskAthletesQuerySchema>;

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

/**
 * A single injury event that occurred when the athlete's ACWR was above
 * the configured threshold. Only plaintext fields from medical_records are
 * returned — no AES-256 clinical fields (clinicalNotes, diagnosis,
 * treatmentDetails) are read or decrypted by this endpoint.
 */
export interface InjuryCorrelationEvent {
  athleteId: string;
  athleteName: string;
  position: string | null;
  /** ISO date YYYY-MM-DD */
  injuryDate: string;
  /** Anatomical structure — plaintext */
  structure: string;
  /** GRADE_1 | GRADE_2 | GRADE_3 | COMPLETE — plaintext */
  grade: string;
  /** CONTACT | NON_CONTACT | OVERUSE | UNKNOWN — plaintext */
  mechanism: string;
  /** ACWR on the day closest to the injury date (within 7 days prior) */
  acwrRatioAtInjury: number | null;
  riskZoneAtInjury: RiskZone | null;
  /** Peak ACWR in the configured window (days) before the injury */
  peakAcwrInWindow: number | null;
}

export interface InjuryCorrelationResponse {
  events: InjuryCorrelationEvent[];
  totalEvents: number;
  windowDays: number;
  minAcwr: number;
  /** ISO timestamp of the most recent ACWR MV data — null if MV is empty */
  acwrDataAsOf: string | null;
}

/**
 * An active athlete currently in a high ACWR risk zone without a recent
 * injury on record — used for proactive injury prevention.
 */
export interface AtRiskAthleteEntry {
  athleteId: string;
  athleteName: string;
  position: string | null;
  currentAcwr: number;
  currentRiskZone: RiskZone;
  /** ISO date of the most recent ACWR data point */
  acwrDate: string;
  /** ISO date of last injury, or null if no medical record exists */
  lastInjuryDate: string | null;
  lastInjuryStructure: string | null;
}

export interface AtRiskAthletesResponse {
  athletes: AtRiskAthleteEntry[];
  minAcwr: number;
  /** ISO timestamp of the most recent ACWR MV data — null if MV is empty */
  acwrDataAsOf: string | null;
}
