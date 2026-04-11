import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type {
  CreateWorkloadMetricInput,
  AcwrEntry,
  AcwrResponse,
  WorkloadMetricResponse,
  RiskZone,
  AttendanceRankingQuery,
  AthleteAttendanceRank,
  AttendanceRankingResponse,
  InjuryCorrelationQuery,
  InjuryCorrelationEvent,
  InjuryCorrelationResponse,
  AtRiskAthletesQuery,
  AtRiskAthleteEntry,
  AtRiskAthletesResponse,
} from "./workload.schema.js";

export class AthleteNotFoundError extends NotFoundError {
  constructor() {
    super("Atleta não encontrado");
  }
}

/**
 * Records a single workload metric for an athlete.
 *
 * Idempotency: when `idempotencyKey` is present and a metric with that key
 * already exists in the tenant schema, the existing record is returned
 * immediately without creating a duplicate. This supports the PWA offline
 * sync queue where the same session may be retried after a network
 * failure.
 *
 * The training load (AU = rpe × durationMinutes) is intentionally NOT stored
 * as a column — it is derived by the acwr_aggregates materialized view on
 * next refresh. We compute and return it in the response for immediate
 * feedback without requiring a view refresh.
 */
export async function recordWorkloadMetric(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateWorkloadMetricInput,
): Promise<WorkloadMetricResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.workloadMetric.findFirst({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return {
          id: existing.id,
          athleteId: existing.athleteId,
          date: existing.date,
          rpe: existing.rpe,
          durationMinutes: existing.durationMinutes,
          trainingLoadAu: existing.rpe * existing.durationMinutes,
          sessionType: existing.sessionType,
          notes: existing.notes,
          createdAt: existing.createdAt,
        };
      }
    }

    const athlete = await tx.athlete.findUnique({
      where: { id: input.athleteId },
      select: { id: true },
    });
    if (!athlete) throw new AthleteNotFoundError();

    const metric = await tx.workloadMetric.create({
      data: {
        athleteId: input.athleteId,
        date: new Date(input.date),
        rpe: input.rpe,
        durationMinutes: input.durationMinutes,
        sessionType: input.sessionType,
        notes: input.notes ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEMBER_UPDATED",
        entityId: metric.id,
        entityType: "WorkloadMetric",
        metadata: {
          athleteId: input.athleteId,
          date: input.date,
          rpe: input.rpe,
          durationMinutes: input.durationMinutes,
          trainingLoadAu: input.rpe * input.durationMinutes,
        },
      },
    });

    return {
      id: metric.id,
      athleteId: metric.athleteId,
      date: metric.date,
      rpe: metric.rpe,
      durationMinutes: metric.durationMinutes,
      trainingLoadAu: metric.rpe * metric.durationMinutes,
      sessionType: metric.sessionType,
      notes: metric.notes,
      createdAt: metric.createdAt,
    };
  });
}

type AcwrRawRow = {
  athleteId: string;
  date: Date;
  daily_au: number;
  acute_load_au: number;
  chronic_load_au: string;
  acute_window_days: number;
  chronic_window_days: number;
  acwr_ratio: string | null;
  risk_zone: string;
};

function mapRawRow(row: AcwrRawRow): AcwrEntry {
  return {
    date: row.date,
    dailyAu: Number(row.daily_au),
    acuteLoadAu: Number(row.acute_load_au),
    chronicLoadAu: Number(row.chronic_load_au),
    acuteWindowDays: Number(row.acute_window_days),
    chronicWindowDays: Number(row.chronic_window_days),
    acwrRatio: row.acwr_ratio !== null ? Number(row.acwr_ratio) : null,
    riskZone: row.risk_zone as RiskZone,
  };
}

/**
 * Returns ACWR history for an athlete from the acwr_aggregates materialized view.
 *
 * Queries the last `days` calendar days of aggregated data. The view is refreshed
 * by BullMQ job every 4 hours, so data may lag behind the latest
 * workload_metric insertions by up to that interval.
 *
 * Returns an empty history (not an error) when the view has no rows for the
 * athlete — this is the expected state before the first refresh runs.
 */
export async function getAthleteAcwr(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
  days: number = 28,
): Promise<AcwrResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: athleteId },
      select: { id: true },
    });
    if (!athlete) throw new AthleteNotFoundError();

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);

    const rows = await tx.$queryRaw<AcwrRawRow[]>`
      SELECT
        "athleteId",
        date,
        daily_au,
        acute_load_au,
        chronic_load_au,
        acute_window_days,
        chronic_window_days,
        acwr_ratio,
        risk_zone
      FROM acwr_aggregates
      WHERE "athleteId" = ${athleteId}
        AND date >= ${cutoff}::date
      ORDER BY date ASC
    `;

    const history = rows.map(mapRawRow);
    const latest = history.length > 0 ? history[history.length - 1]! : null;

    return { athleteId, latest, history };
  });
}

type AttendanceRankingRawRow = {
  athleteId: string;
  name: string;
  position: string | null;
  session_count: number;
  training_days: number;
  last_session_date: Date | null;
  acwr_ratio: string | null;
  risk_zone: string | null;
  acwr_last_refreshed_at: Date | null;
};

/**
 * Returns a ranked list of all active athletes sorted by session count
 * within the configured look-back window, enriched with their latest
 * ACWR risk zone from the acwr_aggregates materialized view.
 *
 * A single aggregated query avoids N+1 per-athlete ACWR fetches.
 * The LATERAL subquery pulls only the most recent row per athlete from
 * acwr_aggregates, which may lag up to 4 hours behind the latest metrics.
 *
 * Athletes with status != 'ACTIVE' are excluded.
 * Athletes with no ACWR data return riskZone: null (before first MV refresh).
 */
export async function getAttendanceRanking(
  prisma: PrismaClient,
  clubId: string,
  params: AttendanceRankingQuery,
): Promise<AttendanceRankingResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - params.days);

    const { Prisma: PrismaNamespace } =
      await import("../../../generated/prisma/index.js");

    const sessionTypeFilter =
      params.sessionType != null
        ? PrismaNamespace.sql`AND wm."sessionType"::text = ${params.sessionType}`
        : PrismaNamespace.empty;

    const rows = await tx.$queryRaw<AttendanceRankingRawRow[]>`
      SELECT
        a.id                                               AS "athleteId",
        a.name,
        a.position,
        COUNT(wm.id)::integer                              AS session_count,
        COUNT(DISTINCT wm.date)::integer                   AS training_days,
        MAX(wm.date)                                       AS last_session_date,
        acwr.acwr_ratio,
        acwr.risk_zone,
        acwr.last_refreshed_at                             AS acwr_last_refreshed_at
      FROM athletes a
      LEFT JOIN workload_metrics wm
        ON  wm."athleteId" = a.id
        AND wm.date >= ${cutoff}::date
        ${sessionTypeFilter}
      LEFT JOIN LATERAL (
        SELECT
          acwr_ratio,
          risk_zone,
          date AS last_refreshed_at
        FROM acwr_aggregates
        WHERE "athleteId" = a.id
        ORDER BY date DESC
        LIMIT 1
      ) acwr ON true
      WHERE a.status = 'ACTIVE'
      GROUP BY
        a.id, a.name, a.position,
        acwr.acwr_ratio, acwr.risk_zone, acwr.last_refreshed_at
      ORDER BY session_count DESC, a.name ASC
    `;

    const athletes: AthleteAttendanceRank[] = rows.map((r) => ({
      athleteId: r.athleteId,
      name: r.name,
      position: r.position,
      sessionCount: Number(r.session_count),
      trainingDays: Number(r.training_days),
      lastSessionDate: r.last_session_date,
      acwrRatio: r.acwr_ratio !== null ? Number(r.acwr_ratio) : null,
      riskZone: r.risk_zone !== null ? (r.risk_zone as RiskZone) : null,
    }));

    const acwrLastRefreshedAt =
      rows.length > 0 && rows[0]!.acwr_last_refreshed_at != null
        ? rows[0]!.acwr_last_refreshed_at
        : null;

    return {
      athletes,
      windowDays: params.days,
      acwrLastRefreshedAt,
    };
  });
}

type CorrelationRawRow = {
  athleteId: string;
  name: string;
  position: string | null;
  injury_date: string;
  structure: string;
  grade: string;
  mechanism: string;
  acwr_ratio_at_injury: string | null;
  risk_zone_at_injury: string | null;
  peak_acwr_in_window: string | null;
  acwr_data_as_of: Date | null;
};

/**
 * Returns injury events that occurred when the athlete's ACWR was above the
 * configured threshold (minAcwr) within the look-back window (days).
 *
 * Only plaintext fields from medical_records are read — clinicalNotes,
 * diagnosis, treatmentDetails are never accessed or decrypted here.
 * This is by design: structure/grade/mechanism are intentionally kept as
 * plaintext for analytics (see schema.prisma and design-docs.md).
 *
 * No data_access_log entry is written — the fields returned are the plaintext
 * analytics fields, not the AES-256 clinical fields subject to LGPD Art. 37.
 *
 * Correlation logic:
 *   - acwr_at_injury: closest ACWR data point within 7 days before the injury
 *   - peak_acwr_in_window: maximum ACWR in the full configured window before injury
 *   - Events are included when EITHER value >= minAcwr
 *
 * ACWR data may lag up to 4h behind the latest workload metric insertions
 * (BullMQ job refresh interval). acwrDataAsOf communicates this to the caller.
 */
export async function getInjuryCorrelation(
  prisma: PrismaClient,
  clubId: string,
  params: InjuryCorrelationQuery,
): Promise<InjuryCorrelationResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const rows = await tx.$queryRaw<CorrelationRawRow[]>`
      SELECT
        a.id                                          AS "athleteId",
        a.name,
        a.position,
        mr."occurredAt"::date::text                   AS injury_date,
        mr.structure,
        mr.grade::text                                AS grade,
        mr.mechanism::text                            AS mechanism,
        acwr_at_injury.acwr_ratio                     AS acwr_ratio_at_injury,
        acwr_at_injury.risk_zone                      AS risk_zone_at_injury,
        acwr_window.peak_acwr                         AS peak_acwr_in_window,
        mv_meta.last_refreshed                        AS acwr_data_as_of
      FROM medical_records mr
      JOIN athletes a ON a.id = mr."athleteId"
      LEFT JOIN LATERAL (
        SELECT acwr_ratio, risk_zone
        FROM acwr_aggregates
        WHERE "athleteId" = mr."athleteId"
          AND date <= mr."occurredAt"::date
          AND date >= mr."occurredAt"::date - INTERVAL '7 days'
        ORDER BY date DESC
        LIMIT 1
      ) acwr_at_injury ON true
      LEFT JOIN LATERAL (
        SELECT MAX(acwr_ratio::numeric) AS peak_acwr
        FROM acwr_aggregates
        WHERE "athleteId" = mr."athleteId"
          AND date <= mr."occurredAt"::date
          AND date >= mr."occurredAt"::date - (${params.days} || ' days')::interval
      ) acwr_window ON true
      LEFT JOIN LATERAL (
        SELECT MAX(date) AS last_refreshed
        FROM acwr_aggregates
        WHERE "athleteId" = mr."athleteId"
      ) mv_meta ON true
      WHERE
        mr."occurredAt" >= CURRENT_DATE - (${params.days} || ' days')::interval
        AND a.status = 'ACTIVE'
        AND (
          acwr_at_injury.acwr_ratio::numeric >= ${params.minAcwr}
          OR acwr_window.peak_acwr::numeric >= ${params.minAcwr}
        )
      ORDER BY mr."occurredAt" DESC
    `;

    const acwrDataAsOf =
      rows.length > 0 && rows[0]!.acwr_data_as_of != null
        ? rows[0]!.acwr_data_as_of.toISOString()
        : null;

    const events: InjuryCorrelationEvent[] = rows.map((r) => ({
      athleteId: r.athleteId,
      athleteName: r.name,
      position: r.position,
      injuryDate: r.injury_date,
      structure: r.structure,
      grade: r.grade,
      mechanism: r.mechanism,
      acwrRatioAtInjury:
        r.acwr_ratio_at_injury !== null ? Number(r.acwr_ratio_at_injury) : null,
      riskZoneAtInjury: r.risk_zone_at_injury as RiskZone | null,
      peakAcwrInWindow:
        r.peak_acwr_in_window !== null ? Number(r.peak_acwr_in_window) : null,
    }));

    return {
      events,
      totalEvents: events.length,
      windowDays: params.days,
      minAcwr: params.minAcwr,
      acwrDataAsOf,
    };
  });
}

type AtRiskRawRow = {
  athleteId: string;
  name: string;
  position: string | null;
  current_acwr: string;
  current_risk_zone: string;
  acwr_date: string;
  last_injury_date: string | null;
  last_injury_structure: string | null;
  acwr_data_as_of: Date | null;
};

/**
 * Returns currently active athletes whose latest ACWR ratio is above the
 * configured threshold — proactive injury prevention view.
 *
 * Results are ordered by ACWR descending (highest-risk athletes first).
 * Athletes with no ACWR data in acwr_aggregates are excluded (JOIN instead
 * of LEFT JOIN on latest_acwr) — they have no usable risk signal.
 *
 * last_injury_date / last_injury_structure come from the most recent
 * medical_records row per athlete (plaintext fields only — no decryption).
 */
export async function getAtRiskAthletes(
  prisma: PrismaClient,
  clubId: string,
  params: AtRiskAthletesQuery,
): Promise<AtRiskAthletesResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const rows = await tx.$queryRaw<AtRiskRawRow[]>`
      SELECT
        a.id                                         AS "athleteId",
        a.name,
        a.position,
        latest_acwr.acwr_ratio                       AS current_acwr,
        latest_acwr.risk_zone                        AS current_risk_zone,
        latest_acwr.date::text                       AS acwr_date,
        last_injury.occurred_at::text                AS last_injury_date,
        last_injury.structure                        AS last_injury_structure,
        mv_meta.last_refreshed                       AS acwr_data_as_of
      FROM athletes a
      JOIN LATERAL (
        SELECT acwr_ratio, risk_zone, date
        FROM acwr_aggregates
        WHERE "athleteId" = a.id
        ORDER BY date DESC
        LIMIT 1
      ) latest_acwr ON true
      LEFT JOIN LATERAL (
        SELECT "occurredAt" AS occurred_at, structure
        FROM medical_records
        WHERE "athleteId" = a.id
        ORDER BY "occurredAt" DESC
        LIMIT 1
      ) last_injury ON true
      LEFT JOIN LATERAL (
        SELECT MAX(date) AS last_refreshed
        FROM acwr_aggregates
        WHERE "athleteId" = a.id
      ) mv_meta ON true
      WHERE
        a.status = 'ACTIVE'
        AND latest_acwr.acwr_ratio::numeric >= ${params.minAcwr}
      ORDER BY latest_acwr.acwr_ratio::numeric DESC
    `;

    const acwrDataAsOf =
      rows.length > 0 && rows[0]!.acwr_data_as_of != null
        ? rows[0]!.acwr_data_as_of.toISOString()
        : null;

    const athletes: AtRiskAthleteEntry[] = rows.map((r) => ({
      athleteId: r.athleteId,
      athleteName: r.name,
      position: r.position,
      currentAcwr: Number(r.current_acwr),
      currentRiskZone: r.current_risk_zone as RiskZone,
      acwrDate: r.acwr_date,
      lastInjuryDate: r.last_injury_date,
      lastInjuryStructure: r.last_injury_structure,
    }));

    return {
      athletes,
      minAcwr: params.minAcwr,
      acwrDataAsOf,
    };
  });
}
