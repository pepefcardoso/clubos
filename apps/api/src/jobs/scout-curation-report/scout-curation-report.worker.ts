import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  SCOUT_CURATION_REPORT_JOB_NAMES,
  type GenerateScoutCurationReportJobData,
} from "./scout-curation-report.types.js";
import {
  generateAndSendCurationReport,
  type CurationReportResult,
} from "./scout-curation-report.service.js";

/**
 * Starts the per-scout monthly curation report worker.
 *
 * Processes `generate-scout-curation-report` jobs — one per ACTIVE scout per month.
 * Calls `generateAndSendCurationReport()` which handles:
 *   - Re-verification of subscription (guard against lapse since dispatch)
 *   - Top-20 athlete query from public schema (no withTenantSchema)
 *   - PDF generation with PDFKit
 *   - Email delivery via Resend with PDF attachment
 *   - communication_log append on success
 *
 * Skip vs throw distinction:
 *   - Subscription lapsed / no athletes / scout not found → return result
 *     (job completes — not a retriable error, no Sentry noise)
 *   - PDFKit failure / DB failure → re-thrown → BullMQ retry with backoff
 *   - Resend failure → non-fatal, emailSent: false, job completes
 *
 * Concurrency = 3 — lower than financial workers because PDF generation
 * is CPU/memory-intensive (same rationale as monthly-report.worker.ts).
 */
export function startScoutCurationReportWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<GenerateScoutCurationReportJobData>(
    "scout-curation-report",
    async (
      job: Job<GenerateScoutCurationReportJobData>,
    ): Promise<CurationReportResult | undefined> => {
      if (
        job.name !==
        SCOUT_CURATION_REPORT_JOB_NAMES.GENERATE_SCOUT_CURATION_REPORT
      ) {
        return;
      }

      const { scoutId, yearMonth } = job.data;

      job.log(
        `[scout-curation] Scout ${scoutId} — generating report for ${yearMonth}`,
      );

      const result = await generateAndSendCurationReport(
        prisma,
        scoutId,
        yearMonth,
      );

      job.log(
        `[scout-curation] Scout ${scoutId} — ` +
          `period: ${result.yearMonth}, ` +
          `athletes: ${result.athleteCount}, ` +
          `emailSent: ${result.emailSent}, ` +
          `skipped: ${result.skipped}` +
          (result.skipReason ? ` (${result.skipReason})` : ""),
      );

      return result;
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as CurationReportResult | undefined;
    if (r) {
      console.info(
        `[scout-curation] Job ${job.id} (scout: ${job.data.scoutId}) completed — ` +
          `period: ${r.yearMonth}, athletes: ${r.athleteCount}, ` +
          `emailSent: ${r.emailSent}, skipped: ${r.skipped}`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[scout-curation] Job ${job?.id} (scout: ${job?.data?.scoutId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
