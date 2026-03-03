import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  BILLING_REMINDER_JOB_NAMES,
  type SendClubRemindersJobData,
} from "./billing-reminder.types.js";
import {
  sendDailyRemindersForClub,
  type ReminderResult,
} from "./billing-reminder.service.js";

/**
 * Starts the per-club billing reminder worker.
 *
 * Processes `send-club-reminders` jobs — one per club per day.
 * Calls `sendDailyRemindersForClub()` which handles:
 *   - PENDING charge lookup for the D+3 window
 *   - Idempotency via `hasRecentMessage()` (20h window)
 *   - Per-club WhatsApp rate limiting (30 msgs/min Redis sliding window)
 *   - Per-member error isolation (template render, provider failures)
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
 *     `sendDailyRemindersForClub` and propagate here, marking the job failed.
 *   - Per-member errors are captured in `result.errors[]` — job completes.
 */
export function startBillingReminderWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<SendClubRemindersJobData>(
    "billing-reminders",
    async (
      job: Job<SendClubRemindersJobData>,
    ): Promise<ReminderResult | undefined> => {
      if (job.name !== BILLING_REMINDER_JOB_NAMES.SEND_CLUB_REMINDERS) return;

      const { clubId, targetDateStart, targetDateEnd } = job.data;

      job.log(`[d3-reminder] Club ${clubId} — starting D-3 reminder job`);

      const result = await sendDailyRemindersForClub(
        prisma,
        clubId,
        new Date(targetDateStart),
        new Date(targetDateEnd),
      );

      job.log(
        `[d3-reminder] Club ${clubId} — ` +
          `sent: ${result.sent}, ` +
          `skipped: ${result.skipped}, ` +
          `rateLimited: ${result.rateLimited}, ` +
          `errors: ${result.errors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn(
          `[d3-reminder] Club ${clubId} — ${result.errors.length} error(s):`,
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
    const r = result as ReminderResult | undefined;
    if (r) {
      console.info(
        `[d3-reminder] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `sent: ${r.sent}, skipped: ${r.skipped}`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[d3-reminder] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
