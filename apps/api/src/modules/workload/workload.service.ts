import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type {
  CreateWorkloadMetricInput,
  AcwrEntry,
  AcwrResponse,
  WorkloadMetricResponse,
  RiskZone,
} from "./workload.schema.js";

export class AthleteNotFoundError extends NotFoundError {
  constructor() {
    super("Atleta não encontrado");
  }
}

/**
 * Records a single workload metric for an athlete.
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
