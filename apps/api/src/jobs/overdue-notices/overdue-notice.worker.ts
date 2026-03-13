import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  OVERDUE_NOTICE_JOB_NAMES,
  type SendClubOverdueNoticesJobData,
} from "./overdue-notice.types.js";
import {
  sendOverdueNoticesForClub,
  type OverdueNoticeResult,
} from "./overdue-notice.service.js";

/**
 * Starts the per-club overdue notice worker.
 *
 * Processes `send-club-overdue-notices` jobs — one per club per day.
 * Calls `sendOverdueNoticesForClub()` which handles:
 *   - PENDING/OVERDUE charge lookup for the D-3 window (3 days ago)
 *   - Idempotency via `hasRecentMessage()` (20h window)
 *   - Per-club WhatsApp rate limiting (30 msgs/min Redis sliding window)
 *   - Per-member error isolation (template render, provider failures)
 *   - Email fallback via Resend when WhatsApp fails a 2nd time
 *
 * Concurrency = 5 per architecture-rules.md:
 *   "Jobs de cobrança rodam com concorrência máxima de 5"
 *
 * Rate-limit retry logic:
 *   When ALL unprocessed charges were rate-limited (sent=0, skipped=0, errors>0
 *   and rateLimited>0), the worker throws to trigger BullMQ retry with backoff.
 *   Partial batches (some sent, some rate-limited) complete successfully —
 *   the rate-limited members will be covered by `hasRecentMessage` idempotency
 *   on subsequent retry if the window has passed.
 *
 * Error propagation:
 *   - `decryptField` failures (system misconfiguration) are re-thrown by
 *     `sendOverdueNoticesForClub` and propagate here, marking the job failed.
 *   - Per-member errors are captured in `result.errors[]` — job still completes.
 */
export function startOverdueNoticeWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<SendClubOverdueNoticesJobData>(
    "overdue-notices",
    async (
      job: Job<SendClubOverdueNoticesJobData>,
    ): Promise<OverdueNoticeResult | undefined> => {
      if (job.name !== OVERDUE_NOTICE_JOB_NAMES.SEND_CLUB_OVERDUE_NOTICES)
        return;

      const { clubId, targetDateStart, targetDateEnd } = job.data;

      job.log(
        `[overdue-notice] Club ${clubId} — starting D+3 overdue notice job`,
      );

      const result = await sendOverdueNoticesForClub(
        prisma,
        clubId,
        new Date(targetDateStart),
        new Date(targetDateEnd),
      );

      job.log(
        `[overdue-notice] Club ${clubId} — ` +
          `sent: ${result.sent}, ` +
          `skipped: ${result.skipped}, ` +
          `rateLimited: ${result.rateLimited}, ` +
          `emailFallbacks: ${result.emailFallbacks}, ` +
          `errors: ${result.errors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn(
          `[overdue-notice] Club ${clubId} — ${result.errors.length} error(s):`,
          result.errors,
        );
      }

      if (result.rateLimited > 0 && result.sent === 0 && result.skipped === 0) {
        throw new Error(
          `Rate limited for club ${clubId} — ${result.rateLimited} overdue notice(s) pending. Retrying.`,
        );
      }

      return result;
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as OverdueNoticeResult | undefined;
    if (r) {
      console.info(
        `[overdue-notice] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `sent: ${r.sent}, skipped: ${r.skipped}, emailFallbacks: ${r.emailFallbacks}`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[overdue-notice] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
