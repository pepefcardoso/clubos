export type AthleteStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type SessionType = "MATCH" | "TRAINING" | "GYM" | "RECOVERY" | "OTHER";
export type SyncStatus = "pending" | "syncing" | "synced" | "error";

/**
 * Read-only cache of server athlete data.
 *
 * CPF, phone and email are intentionally excluded — these fields are sensitive
 * PII (CPF is AES-256 encrypted at rest server-side) and are not required for
 * any offline coaching workflow. Storing them here would violate Privacy by
 * Design and create unnecessary LGPD exposure.
 */
export interface CachedAthlete {
  /** Server-assigned cuid2 (primary key) */
  id: string;
  /** Tenant isolation — every record must carry clubId */
  clubId: string;
  name: string;
  /** ISO date string YYYY-MM-DD */
  birthDate: string;
  position: string | null;
  status: AthleteStatus;
  /** Date.now() at time of caching — used for TTL invalidation */
  cachedAt: number;
}

/**
 * Offline-created coaching session, queued for sync when connectivity returns.
 *
 * The training load (AU = rpe × durationMinutes) is computed server-side by
 * the acwr_aggregates materialized view — we do not store it locally to avoid
 * divergence with the server's authoritative value.
 */
export interface TrainingSession {
  /** Client-generated hex ID (primary key) — becomes the idempotencyKey on sync */
  localId: string;
  /** Tenant isolation */
  clubId: string;
  athleteId: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  /** Foster Session-RPE scale: 1–10 */
  rpe: number;
  durationMinutes: number;
  sessionType: SessionType;
  notes: string | null;
  syncStatus: SyncStatus;
  /** Last sync error message — null when syncStatus is not "error" */
  syncError: string | null;
  /** Date.now() at creation */
  createdAt: number;
  /** Date.now() at last status change */
  updatedAt: number;
  /** workload_metric.id returned by the API after successful sync */
  serverId: string | null;
}

/** Minimal shape required to create a new offline session */
export type CreateTrainingSessionInput = Pick<
  TrainingSession,
  | "clubId"
  | "athleteId"
  | "date"
  | "rpe"
  | "durationMinutes"
  | "sessionType"
  | "notes"
>;
