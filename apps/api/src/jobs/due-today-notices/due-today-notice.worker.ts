import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  DUE_TODAY_NOTICE_JOB_NAMES,
  type SendClubDueTodayNoticesJobData,
} from "./due-today-notice.types.js";
import {
  sendDueTodayNoticesForClub,
  type DueTodayNoticeResult,
} from "./due-today-notice.service.js";

/**
 * Starts the per-club D-0 due-today notice worker.
 *
 * Processes `send-club-due-today-notices` jobs — one per club per day.
 * Calls `sendDueTodayNoticesForClub()` which handles:
 *   - PENDING charge lookup for today's UTC window
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
 *   on the next day's run if the window has passed.
 *
 * Error propagation:
 *   - `decryptField` failures (system misconfiguration) are re-thrown by
 *     `sendDueTodayNoticesForClub` and propagate here, marking the job failed.
 *   - Per-member errors are captured in `result.errors[]` — job completes.
 */
export function startDueTodayNoticeWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<SendClubDueTodayNoticesJobData>(
    "due-today-notices",
    async (
      job: Job<SendClubDueTodayNoticesJobData>,
    ): Promise<DueTodayNoticeResult | undefined> => {
      if (job.name !== DUE_TODAY_NOTICE_JOB_NAMES.SEND_CLUB_DUE_TODAY_NOTICES)
        return;

      const { clubId, targetDateStart, targetDateEnd } = job.data;

      job.log(`[d0-notice] Club ${clubId} — starting D-0 due-today notice job`);

      const result = await sendDueTodayNoticesForClub(
        prisma,
        clubId,
        new Date(targetDateStart),
        new Date(targetDateEnd),
      );

      job.log(
        `[d0-notice] Club ${clubId} — ` +
          `sent: ${result.sent}, ` +
          `skipped: ${result.skipped}, ` +
          `rateLimited: ${result.rateLimited}, ` +
          `emailFallbacks: ${result.emailFallbacks}, ` +
          `errors: ${result.errors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn(
          `[d0-notice] Club ${clubId} — ${result.errors.length} error(s):`,
          result.errors,
        );
      }

      if (result.rateLimited > 0 && result.sent === 0 && result.skipped === 0) {
        throw new Error(
          `Rate limited for club ${clubId} — ${result.rateLimited} message(s) pending. Retrying.`,
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
    const r = result as DueTodayNoticeResult | undefined;
    if (r) {
      console.info(
        `[d0-notice] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `sent: ${r.sent}, skipped: ${r.skipped}, emailFallbacks: ${r.emailFallbacks}`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[d0-notice] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
