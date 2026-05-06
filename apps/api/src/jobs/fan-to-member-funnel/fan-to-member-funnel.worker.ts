import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  FAN_FUNNEL_JOB_NAMES,
  type SendFanConversionJobData,
  type FanConversionResult,
} from "./fan-to-member-funnel.types.js";
import { sendFanConversionMessage } from "./fan-to-member-funnel.service.js";

/**
 * Processes fan-to-member funnel conversion jobs enqueued by validateTicket()
 * after a successful gate check-in.
 *
 * Idempotency: sendFanConversionMessage() returns { status: "SKIPPED" } when
 * the Redis dedup key is present — safe to retry without duplicate emails.
 *
 * Concurrency: 3 — email-only, no WhatsApp rate-limit concern; lower than
 * financial workers (5) to avoid saturating the Resend API connection pool.
 */
export function startFanFunnelWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<SendFanConversionJobData>(
    "fan-to-member-funnel",
    async (
      job: Job<SendFanConversionJobData>,
    ): Promise<FanConversionResult | undefined> => {
      if (job.name !== FAN_FUNNEL_JOB_NAMES.SEND_FAN_CONVERSION) return;

      const { ticketId, eventId, clubId } = job.data;

      job.log(
        `[fan-funnel] Starting conversion email for ticket ${ticketId} (club: ${clubId}, event: ${eventId})`,
      );

      const result = await sendFanConversionMessage(
        prisma,
        connection,
        clubId,
        ticketId,
        eventId,
      );

      job.log(
        `[fan-funnel] Ticket ${ticketId} — status: ${result.status}${
          result.status !== "SENT" ? `, reason: ${result.reason}` : ""
        }`,
      );

      return result;
    },
    {
      connection,
      concurrency: 3,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as FanConversionResult | undefined;
    if (r?.status === "SENT") {
      console.info(
        `[fan-funnel] Job ${job.id} (ticket: ${job.data.ticketId}) completed — conversion email sent`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[fan-funnel] Job ${job?.id} (ticket: ${job?.data?.ticketId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
