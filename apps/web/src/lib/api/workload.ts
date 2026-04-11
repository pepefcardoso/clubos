const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface RecordWorkloadPayload {
  athleteId: string;
  date: string;
  rpe: number;
  durationMinutes: number;
  sessionType: "MATCH" | "TRAINING" | "GYM" | "RECOVERY" | "OTHER";
  notes?: string | null;
  /**
   * Client-generated 32-char hex ID — prevents duplicate server records on retry.
   * Corresponds to TrainingSession.localId in the offline queue.
   */
  idempotencyKey: string;
}

export interface RecordWorkloadResponse {
  id: string;
  athleteId: string;
  date: string;
  rpe: number;
  durationMinutes: number;
  trainingLoadAu: number;
  sessionType: string;
  notes: string | null;
  createdAt: string;
}

export class WorkloadApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * true for 429 and 5xx — request may succeed after a delay.
     * false for 4xx (except 429) — bad data won't fix itself on retry.
     */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WorkloadApiError";
  }
}

/**
 * POSTs a workload metric to the server.
 *
 * The `idempotencyKey` in the payload corresponds to the client-assigned
 * `localId` on the offline TrainingSession record. The server uses it to
 * deduplicate retried requests so a single coaching session is never
 * recorded twice even if the sync worker fires multiple times.
 *
 * Throws WorkloadApiError on any non-2xx response.
 */
export async function postWorkloadMetric(
  payload: RecordWorkloadPayload,
  accessToken: string,
): Promise<RecordWorkloadResponse> {
  const res = await fetch(`${API_BASE}/api/workload/metrics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const retryable = res.status === 429 || res.status >= 500;
    throw new WorkloadApiError(
      body.message ?? `HTTP ${res.status}`,
      res.status,
      retryable,
    );
  }

  return res.json() as Promise<RecordWorkloadResponse>;
}

export type RiskZone =
  | "insufficient_data"
  | "low"
  | "optimal"
  | "high"
  | "very_high";

export interface AthleteAttendanceRank {
  athleteId: string;
  name: string;
  position: string | null;
  sessionCount: number;
  trainingDays: number;
  lastSessionDate: string | null;
  acwrRatio: number | null;
  riskZone: RiskZone | null;
}

export interface AttendanceRankingResponse {
  athletes: AthleteAttendanceRank[];
  windowDays: number;
  /** ISO timestamp of the last ACWR refresh — null if view has no data yet */
  acwrLastRefreshedAt: string | null;
}

/**
 * Fetches the attendance ranking for all active athletes in the club.
 * Data is sorted by session count (DESC) and enriched with the latest
 * ACWR risk zone from the materialized view (may lag up to 4 h).
 */
export async function fetchAttendanceRanking(
  params: { days?: number; sessionType?: string },
  accessToken: string,
): Promise<AttendanceRankingResponse> {
  const query = new URLSearchParams();
  if (params.days) query.set("days", String(params.days));
  if (params.sessionType) query.set("sessionType", params.sessionType);

  const res = await fetch(
    `${API_BASE}/api/workload/attendance-ranking?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<AttendanceRankingResponse>;
}

export interface AcwrEntry {
  /** ISO date string returned from the API (e.g. "2024-06-01T00:00:00.000Z") */
  date: string;
  dailyAu: number;
  acuteLoadAu: number;
  chronicLoadAu: number;
  acuteWindowDays: number;
  chronicWindowDays: number;
  acwrRatio: number | null;
  riskZone: RiskZone;
}

export interface AthleteAcwrResponse {
  athleteId: string;
  latest: AcwrEntry | null;
  history: AcwrEntry[];
}

/**
 * Fetches ACWR history for a single athlete from the acwr_aggregates
 * materialized view.  Data may lag up to 4 h behind the latest workload
 * metric insertions — `latest.date` indicates freshness.
 *
 * Returns `{ latest: null, history: [] }` (not an error) when the view has
 * no rows for the athlete — expected state before the first MV refresh.
 */
export async function fetchAthleteAcwr(
  athleteId: string,
  days: number = 28,
  accessToken: string,
): Promise<AthleteAcwrResponse> {
  const res = await fetch(
    `${API_BASE}/api/workload/athletes/${athleteId}/acwr?days=${days}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<AthleteAcwrResponse>;
}

/**
 * A single injury event that occurred when the athlete's ACWR was elevated.
 * Only plaintext fields from medical_records — no clinical decryption.
 */
export interface InjuryCorrelationEvent {
  athleteId: string;
  athleteName: string;
  position: string | null;
  /** ISO date YYYY-MM-DD */
  injuryDate: string;
  structure: string;
  grade: string;
  mechanism: string;
  acwrRatioAtInjury: number | null;
  riskZoneAtInjury: RiskZone | null;
  peakAcwrInWindow: number | null;
}

export interface InjuryCorrelationResponse {
  events: InjuryCorrelationEvent[];
  totalEvents: number;
  windowDays: number;
  minAcwr: number;
  /** ISO timestamp of last ACWR MV update — null if MV is empty */
  acwrDataAsOf: string | null;
}

/**
 * An active athlete currently in a high ACWR zone without a recent injury.
 */
export interface AtRiskAthleteEntry {
  athleteId: string;
  athleteName: string;
  position: string | null;
  currentAcwr: number;
  currentRiskZone: RiskZone;
  acwrDate: string;
  lastInjuryDate: string | null;
  lastInjuryStructure: string | null;
}

export interface AtRiskAthletesResponse {
  athletes: AtRiskAthleteEntry[];
  minAcwr: number;
  acwrDataAsOf: string | null;
}

/**
 * Fetches injury events that occurred while the athlete's ACWR was above the
 * configured threshold. Restricted to ADMIN | PHYSIO on the server.
 */
export async function fetchInjuryCorrelation(
  params: { days?: number; minAcwr?: number },
  accessToken: string,
): Promise<InjuryCorrelationResponse> {
  const query = new URLSearchParams();
  if (params.days) query.set("days", String(params.days));
  if (params.minAcwr) query.set("minAcwr", String(params.minAcwr));

  const res = await fetch(
    `${API_BASE}/api/workload/injury-correlation?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<InjuryCorrelationResponse>;
}

/**
 * Fetches currently active athletes whose ACWR is at or above minAcwr.
 * Restricted to ADMIN | PHYSIO on the server.
 */
export async function fetchAtRiskAthletes(
  params: { minAcwr?: number },
  accessToken: string,
): Promise<AtRiskAthletesResponse> {
  const query = new URLSearchParams();
  if (params.minAcwr) query.set("minAcwr", String(params.minAcwr));

  const res = await fetch(
    `${API_BASE}/api/workload/at-risk-athletes?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<AtRiskAthletesResponse>;
}
