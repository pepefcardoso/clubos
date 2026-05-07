import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  GAME_LOGISTICS_NOTICE_JOB_NAMES,
  type GameLogisticsNoticeJobData,
  type GameLogisticsNoticeResult,
} from "./game-logistics-notice.types.js";
import { sendGameLogisticsNotice } from "./game-logistics-notice.service.js";

/**
 * Starts the per-event game logistics notice worker.
 *
 * Processes `send-game-logistics-notice` jobs — one per event, fired 48h before eventDate.
 * No cron — jobs are enqueued on-demand with a delay by event-management.service.ts.
 *
 * Email-only delivery: no WhatsApp rate-limit concern.
 * Concurrency = 3 (matches contract-alert pattern for email-only, CPU-light jobs).
 *
 * Graceful skips (job completes, not fails):
 *   - Club deleted | no ADMIN users | event cancelled before job fires
 *
 * Re-throw on unexpected errors → BullMQ marks job failed → retry with exponential backoff.
 */
export function startGameLogisticsNoticeWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<GameLogisticsNoticeJobData>(
    "game-logistics-notice",
    async (
      job: Job<GameLogisticsNoticeJobData>,
    ): Promise<GameLogisticsNoticeResult | undefined> => {
      if (
        job.name !== GAME_LOGISTICS_NOTICE_JOB_NAMES.SEND_GAME_LOGISTICS_NOTICE
      )
        return;

      const { clubId, eventId } = job.data;

      job.log(
        `[game-logistics] Club ${clubId} — sending logistics notice for event ${eventId}`,
      );

      const result = await sendGameLogisticsNotice(prisma, clubId, eventId);

      job.log(
        `[game-logistics] Club ${clubId} — sent: ${result.sent}, skipped: ${result.skipped}` +
          (result.reason ? `, reason: ${result.reason}` : "") +
          (result.errors?.length ? `, errors: ${result.errors.length}` : ""),
      );

      if (result.errors && result.errors.length > 0) {
        console.warn(
          `[game-logistics] Club ${clubId} event ${eventId} — ${result.errors.length} email error(s):`,
          result.errors,
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
    const r = result as GameLogisticsNoticeResult | undefined;
    if (r) {
      console.info(
        `[game-logistics] Job ${job.id} (club: ${job.data.clubId}, event: ${job.data.eventId}) completed — ` +
          `sent: ${r.sent}, skipped: ${r.skipped}`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[game-logistics] Job ${job?.id} (club: ${job?.data?.clubId}, event: ${job?.data?.eventId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
