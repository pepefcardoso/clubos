import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { getRedisClient } from "../../lib/redis.js";
import { sendWhatsAppMessage } from "../whatsapp/whatsapp.service.js";

export interface AthleteWeeklyStats {
  athleteId: string;
  athleteName: string;
  sessionCount: number;
  totalAu: number;
  acwrRatio: number | null;
  riskZone: string | null;
  guardianMemberId: string | null;
  encryptedGuardianPhone: Uint8Array | null;
}

export interface WeeklyReportResult {
  clubId: string;
  weekKey: string;
  athletesProcessed: number;
  sent: number;
  /** Athletes with no guardian phone, 0 sessions, rate-limit hit, or already sent */
  skipped: number;
  failed: number;
  durationMs: number;
}

/**
 * Idempotency window: 7 days in seconds.
 * A report for the same athlete in the same week will be skipped on retry.
 */
const REPORT_IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Builds a Portuguese WhatsApp message summarising an athlete's week.
 *
 * Emoji risk-zone mapping:
 *   low          → 🔵 (under-training)
 *   optimal      → 🟢 (safe zone)
 *   high         → 🟡 (caution)
 *   very_high    → 🔴 (danger)
 *   anything else → ⚪ (insufficient data)
 */
export function buildWeeklyReportMessage(
  athlete: AthleteWeeklyStats,
  weekKey: string,
): string {
  const riskEmoji =
    athlete.riskZone === "optimal"
      ? "🟢"
      : athlete.riskZone === "high"
        ? "🟡"
        : athlete.riskZone === "very_high"
          ? "🔴"
          : athlete.riskZone === "low"
            ? "🔵"
            : "⚪";

  return (
    `📊 *Relatório Semanal — ${athlete.athleteName}* (${weekKey})\n\n` +
    `✅ Treinos na semana: *${athlete.sessionCount}*\n` +
    `⚡ Carga total (UA): *${athlete.totalAu}*\n` +
    `${riskEmoji} Zona de risco ACWR: *${athlete.riskZone ?? "dados insuficientes"}*\n\n` +
    `_Relatório gerado automaticamente pelo ClubOS._`
  );
}

/**
 * Collects 7-day attendance + training load stats for every active athlete
 * in the club, enriched with their latest ACWR risk zone and guardian phone.
 *
 * Guardian phone resolution: name-based soft link — queries `members` for a
 * row whose `name` matches the athlete's name (case-insensitive, status=ACTIVE).
 * Phone is returned as encrypted bytes so the caller can decrypt as needed.
 * Returns null guardian fields for athletes without a matching member record.
 */
export async function gatherAthleteStats(
  prisma: PrismaClient,
  clubId: string,
  startDate: Date,
  endDate: Date,
): Promise<AthleteWeeklyStats[]> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    type RawRow = {
      athleteId: string;
      athleteName: string;
      session_count: number;
      total_au: number;
      acwr_ratio: string | null;
      risk_zone: string | null;
      guardian_member_id: string | null;
      encrypted_guardian_phone: Uint8Array | null;
    };

    const rows = await tx.$queryRaw<RawRow[]>`
      SELECT
        a.id                                                         AS "athleteId",
        a.name                                                       AS "athleteName",
        COUNT(wm.id)::integer                                        AS session_count,
        COALESCE(SUM(wm.rpe * wm."durationMinutes"), 0)::integer     AS total_au,
        acwr.acwr_ratio,
        acwr.risk_zone,
        m.id                                                         AS guardian_member_id,
        m.phone                                                      AS encrypted_guardian_phone
      FROM athletes a
      LEFT JOIN workload_metrics wm
        ON  wm."athleteId" = a.id
        AND wm.date >= ${startDate}::date
        AND wm.date <  ${endDate}::date
      LEFT JOIN LATERAL (
        SELECT acwr_ratio, risk_zone
        FROM   acwr_aggregates
        WHERE  "athleteId" = a.id
        ORDER  BY date DESC
        LIMIT  1
      ) acwr ON true
      LEFT JOIN members m
        ON  LOWER(m.name) = LOWER(a.name)
        AND m.status = 'ACTIVE'
      WHERE a.status = 'ACTIVE'
      GROUP BY a.id, a.name, acwr.acwr_ratio, acwr.risk_zone, m.id, m.phone
      ORDER BY a.name ASC
    `;

    return rows.map((r) => ({
      athleteId: r.athleteId,
      athleteName: r.athleteName,
      sessionCount: Number(r.session_count),
      totalAu: Number(r.total_au),
      acwrRatio: r.acwr_ratio !== null ? Number(r.acwr_ratio) : null,
      riskZone: r.risk_zone,
      guardianMemberId: r.guardian_member_id,
      encryptedGuardianPhone: r.encrypted_guardian_phone,
    }));
  });
}

/**
 * Returns the Redis idempotency key for a weekly athlete report.
 * Format: `weekly-report:{clubId}:{athleteId}:{weekKey}`
 */
export function buildIdempotencyKey(
  clubId: string,
  athleteId: string,
  weekKey: string,
): string {
  return `weekly-report:${clubId}:${athleteId}:${weekKey}`;
}

/**
 * Internal row shape returned by the weekly report query.
 * guardian_phone is the decrypted phone (or null if no matching member).
 */
type WeeklyReportRow = {
  athleteId: string;
  athleteName: string;
  session_count: number;
  total_au: number;
  acwr_ratio: string | null;
  risk_zone: string | null;
  encrypted_guardian_phone: Uint8Array | null;
  guardian_member_id: string | null;
};

/**
 * Orchestrates the weekly athlete report send for a single club.
 *
 * For each active athlete:
 *   1. Skip if no guardian phone or 0 sessions in the window.
 *   2. Skip if a Redis idempotency key exists (already sent this week).
 *   3. Send WhatsApp message via sendWhatsAppMessage (providers/index).
 *   4. On success: record Redis idempotency key (TTL=7 days), write
 *      Message row (SENT) and AuditLog entry.
 *   5. On failure: write Message row (FAILED).
 *
 * Per-athlete WhatsApp failures are caught and counted as `failed` — they do
 * not abort the run for other athletes in the same club.
 *
 * @param prisma      Global Prisma client.
 * @param clubId      Tenant club ID.
 * @param weekKey     ISO week string forwarded from dispatch (e.g. "2025-W24").
 * @param triggeredAt ISO datetime string used to compute the 7-day window end.
 */
export async function sendWeeklyAthleteReports(
  prisma: PrismaClient,
  clubId: string,
  weekKey: string,
  triggeredAt: string,
): Promise<WeeklyReportResult> {
  const startedAt = Date.now();
  const redis = getRedisClient();

  const endDate = new Date(triggeredAt);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 7);

  const rows = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.$queryRaw<WeeklyReportRow[]>`
      SELECT
        a.id                                                         AS "athleteId",
        a.name                                                       AS "athleteName",
        COUNT(wm.id)::integer                                        AS session_count,
        COALESCE(SUM(wm.rpe * wm."durationMinutes"), 0)::integer     AS total_au,
        acwr.acwr_ratio,
        acwr.risk_zone,
        m.phone                                                      AS encrypted_guardian_phone,
        m.member_id                                                  AS guardian_member_id
      FROM athletes a
      LEFT JOIN workload_metrics wm
        ON  wm."athleteId" = a.id
        AND wm.date >= ${startDate}::date
        AND wm.date <  ${endDate}::date
      LEFT JOIN LATERAL (
        SELECT acwr_ratio, risk_zone
        FROM   acwr_aggregates
        WHERE  "athleteId" = a.id
        ORDER  BY date DESC
        LIMIT  1
      ) acwr ON true
      LEFT JOIN LATERAL (
        SELECT m2.phone,
               m2.id AS member_id
        FROM   members m2
        WHERE  LOWER(m2.name) = LOWER(a.name)
          AND  m2.status = 'ACTIVE'
        LIMIT  1
      ) m ON true
      WHERE a.status = 'ACTIVE'
      GROUP BY a.id, a.name, acwr.acwr_ratio, acwr.risk_zone, m.phone, m.member_id
      ORDER BY a.name ASC
    `;
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.encrypted_guardian_phone || !row.guardian_member_id) {
      skipped++;
      continue;
    }

    if (Number(row.session_count) === 0) {
      skipped++;
      continue;
    }

    const idempotencyKey = buildIdempotencyKey(clubId, row.athleteId, weekKey);

    let alreadySent = false;
    try {
      const existing = await redis.get(idempotencyKey);
      alreadySent = existing !== null;
    } catch {
      alreadySent = false;
    }

    if (alreadySent) {
      skipped++;
      continue;
    }

    const stats: AthleteWeeklyStats = {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      sessionCount: Number(row.session_count),
      totalAu: Number(row.total_au),
      acwrRatio: row.acwr_ratio !== null ? Number(row.acwr_ratio) : null,
      riskZone: row.risk_zone,
      guardianMemberId: row.guardian_member_id,
      encryptedGuardianPhone: row.encrypted_guardian_phone,
    };

    const messageBody = buildWeeklyReportMessage(stats, weekKey);

    try {
      const result = await sendWhatsAppMessage(
        prisma,
        {
          clubId,
          memberId: row.guardian_member_id,
          encryptedPhone: row.encrypted_guardian_phone,
          template: "weekly_athlete_report",
          renderedBody: messageBody,
        },
        "system:cron",
      );

      if (result.status === "SENT") {
        await redis.set(
          idempotencyKey,
          "1",
          "EX",
          REPORT_IDEMPOTENCY_TTL_SECONDS,
        );

        await withTenantSchema(prisma, clubId, async (tx) => {
          await tx.auditLog.create({
            data: {
              memberId: row.guardian_member_id,
              actorId: "system:cron",
              action: "WEEKLY_ATHLETE_REPORT_SENT",
              entityId: row.athleteId,
              entityType: "Athlete",
              metadata: {
                weekKey,
                sessionCount: Number(row.session_count),
                totalAu: Number(row.total_au),
                acwrRatio:
                  row.acwr_ratio !== null ? Number(row.acwr_ratio) : null,
                riskZone: row.risk_zone,
                messageId: result.messageId,
              },
            },
          });
        });

        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }
  }

  return {
    clubId,
    weekKey,
    athletesProcessed: rows.length,
    sent,
    skipped,
    failed,
    durationMs: Date.now() - startedAt,
  };
}
