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
 * Phone is decrypted inline via pgcrypto so we never store plaintext.
 * Returns null guardian_phone for athletes without a matching member record.
 *
 * A future migration can add an explicit `guardianMemberId` FK to `athletes`;
 * swapping the lookup is transparent to the rest of the service.
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
 * Orchestrates the weekly athlete report send for a single club.
 *
 * For each active athlete:
 *   1. Skip if no guardian phone or 0 sessions in the window.
 *   2. Skip if a Redis idempotency key exists (already sent this week).
 *   3. Send WhatsApp message via the provider configured in WHATSAPP_PROVIDER.
 *   4. Record the idempotency key (TTL=7 days).
 *   5. Write message + audit_log rows to the tenant schema.
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

  const stats = await gatherAthleteStats(prisma, clubId, startDate, endDate);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const athlete of stats) {
    if (!athlete.guardianMemberId || !athlete.encryptedGuardianPhone) {
      skipped++;
      continue;
    }

    if (athlete.sessionCount === 0) {
      skipped++;
      continue;
    }

    const idempotencyKey = buildIdempotencyKey(
      clubId,
      athlete.athleteId,
      weekKey,
    );

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

    const message = buildWeeklyReportMessage(athlete, weekKey);

    try {
      const waResult = await sendWhatsAppMessage(
        prisma,
        {
          clubId,
          memberId: athlete.guardianMemberId,
          encryptedPhone: athlete.encryptedGuardianPhone,
          template: "weekly_athlete_report",
          renderedBody: message,
        },
        "system:cron",
      );

      if (waResult.status === "SENT") {
        await redis.set(
          idempotencyKey,
          "1",
          "EX",
          REPORT_IDEMPOTENCY_TTL_SECONDS,
        );

        await withTenantSchema(prisma, clubId, async (tx) => {
          await tx.auditLog.create({
            data: {
              actorId: "system:cron",
              action: "WEEKLY_ATHLETE_REPORT_SENT" as never,
              entityId: athlete.athleteId,
              entityType: "Athlete",
              metadata: {
                weekKey,
                sessionCount: athlete.sessionCount,
                totalAu: athlete.totalAu,
                acwrRatio: athlete.acwrRatio,
                riskZone: athlete.riskZone,
                messageId: waResult.messageId,
              },
            },
          });
        });

        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return {
    clubId,
    weekKey,
    athletesProcessed: stats.length,
    sent,
    skipped,
    failed,
    durationMs: Date.now() - startedAt,
  };
}
