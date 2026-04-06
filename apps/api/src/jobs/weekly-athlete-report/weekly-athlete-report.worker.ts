import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  WEEKLY_ATHLETE_REPORT_JOB_NAMES,
  type SendClubWeeklyReportJobData,
} from "./weekly-athlete-report.types.js";
import {
  sendWeeklyAthleteReports,
  type WeeklyReportResult,
} from "../../modules/workload/weekly-report.service.js";

/**
 * Starts the per-club weekly athlete report worker.
 *
 * Processes `send-club-weekly-report` jobs — one per club per weekly run.
 * Calls `sendWeeklyAthleteReports()` which:
 *   - Gathers 7-day attendance + training load stats for every active athlete
 *   - Resolves each athlete's guardian phone via name-based member lookup
 *   - Applies idempotency (Redis key, 7-day TTL) to prevent duplicate sends
 *   - Enforces WhatsApp rate limit (30 msg/min per club)
 *   - Sends the formatted WhatsApp message
 *   - Writes message and audit_log rows to the tenant schema
 *
 * Concurrency = 3: each job involves a DB read + N WhatsApp sends, which
 * are I/O-bound. Lower than financial workers (5) because WhatsApp rate
 * limits constrain throughput anyway; 3 is sufficient for v1 club counts.
 *
 * Error policy:
 *   - DB errors from `sendWeeklyAthleteReports` are re-thrown so BullMQ
 *     applies the configured exponential backoff (max 2 attempts).
 *   - Per-athlete WhatsApp failures are handled internally and counted in
 *     the result's `failed` field — they do not abort the entire club run.
 *   - On exhaustion the club's athletes simply receive no report that week,
 *     which is acceptable for this non-critical informational job.
 *
 * Idempotency: the Redis key guard inside `sendWeeklyAthleteReports` ensures
 * that reprocessing the same job does not send duplicate messages.
 */
export function startWeeklyAthleteReportWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<SendClubWeeklyReportJobData>(
    "weekly-athlete-report",
    async (
      job: Job<SendClubWeeklyReportJobData>,
    ): Promise<WeeklyReportResult | undefined> => {
      if (job.name !== WEEKLY_ATHLETE_REPORT_JOB_NAMES.SEND_CLUB_WEEKLY_REPORT)
        return;

      const { clubId, weekKey, triggeredAt } = job.data;

      job.log(
        `[weekly-report] Club ${clubId} — starting weekly athlete report ` +
          `for week ${weekKey}`,
      );

      const result = await sendWeeklyAthleteReports(
        prisma,
        clubId,
        weekKey,
        triggeredAt,
      );

      job.log(
        `[weekly-report] Club ${clubId} — week ${weekKey} complete: ` +
          `sent=${result.sent}, skipped=${result.skipped}, ` +
          `failed=${result.failed}, durationMs=${result.durationMs}ms`,
      );

      return result;
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as WeeklyReportResult | undefined;
    if (r) {
      console.info(
        `[weekly-report] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `week: ${r.weekKey}, sent: ${r.sent}, skipped: ${r.skipped}, ` +
          `failed: ${r.failed}, durationMs: ${r.durationMs}ms`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[weekly-report] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
