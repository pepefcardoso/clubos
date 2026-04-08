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
