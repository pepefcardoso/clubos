import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  MONTHLY_REPORT_JOB_NAMES,
  type GenerateClubMonthlyReportJobData,
} from "./monthly-report.types.js";
import {
  generateAndSendMonthlyReport,
  type MonthlyReportResult,
} from "./monthly-report.service.js";

/**
 * Starts the per-club monthly financial report worker.
 *
 * Processes `generate-club-monthly-report` jobs — one per club per month.
 * Calls `generateAndSendMonthlyReport()` which handles:
 *   - Previous-month revenue aggregation via `getRevenueStatement()`
 *   - PDF generation with PDFKit
 *   - Email delivery to all club ADMIN users via Resend with PDF attachment
 *   - Graceful skip when no ADMIN users have email addresses
 *
 * Concurrency = 3:
 *   Lower than the financial worker cap of 5 because PDF generation is
 *   CPU/memory-intensive. Isolation from financial queues prevents report
 *   generation from starving charge or reminder workers during peak load.
 *
 * No rate-limit retry logic:
 *   Email delivery is not subject to the 30 msgs/min per-club WhatsApp
 *   constraint. Per-recipient Resend failures are accumulated in the result
 *   but do not cause the job to throw — the job completes even if some
 *   addresses fail (non-fatal informational job).
 *
 * Error propagation:
 *   - PDF generation failures (e.g. PDFKit internal error) are re-thrown,
 *     marking the BullMQ job as failed and triggering retry with backoff.
 *   - `getRevenueStatement` DB failures propagate the same way.
 *   - Per-recipient email failures are captured in `result.emailsFailed` —
 *     job still completes.
 */
export function startMonthlyReportWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<GenerateClubMonthlyReportJobData>(
    "monthly-report",
    async (
      job: Job<GenerateClubMonthlyReportJobData>,
    ): Promise<MonthlyReportResult | undefined> => {
      if (job.name !== MONTHLY_REPORT_JOB_NAMES.GENERATE_CLUB_MONTHLY_REPORT)
        return;

      const { clubId, reportPeriod, periodStart, periodEnd } = job.data;

      job.log(
        `[monthly-report] Club ${clubId} — generating report for ${reportPeriod}`,
      );

      const result = await generateAndSendMonthlyReport(
        prisma,
        clubId,
        new Date(periodStart),
        new Date(periodEnd),
        reportPeriod,
      );

      job.log(
        `[monthly-report] Club ${clubId} — ` +
          `period: ${result.reportPeriod}, ` +
          `admins: ${result.adminCount}, ` +
          `sent: ${result.emailsSent}, ` +
          `failed: ${result.emailsFailed}, ` +
          `skipped: ${result.skipped}` +
          (result.skipReason ? ` (${result.skipReason})` : ""),
      );

      if (result.emailsFailed > 0) {
        console.warn(
          `[monthly-report] Club ${clubId} — ${result.emailsFailed} email(s) failed to deliver`,
        );
      }

      return result;
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as MonthlyReportResult | undefined;
    if (r) {
      console.info(
        `[monthly-report] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `period: ${r.reportPeriod}, sent: ${r.emailsSent}, ` +
          `failed: ${r.emailsFailed}, skipped: ${r.skipped}`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[monthly-report] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
