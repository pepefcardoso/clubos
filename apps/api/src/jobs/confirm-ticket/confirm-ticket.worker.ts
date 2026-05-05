import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  CONFIRM_TICKET_JOB_NAMES,
  type ConfirmTicketJobData,
  type ConfirmTicketResult,
} from "./confirm-ticket.types.js";
import { confirmTicketAndNotify } from "./confirm-ticket.service.js";

/**
 * Processes confirm-ticket jobs enqueued by the webhook worker after a
 * ticket payment is confirmed by the gateway.
 *
 * Idempotency: confirmTicketAndNotify() returns { skipped: true } when the
 * ticket is already PAID — safe to retry without duplicate emails.
 *
 * Concurrency: 5 (matches architecture-rules.md cap for financial jobs).
 */
export function startConfirmTicketWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<ConfirmTicketJobData>(
    "confirm-ticket",
    async (
      job: Job<ConfirmTicketJobData>,
    ): Promise<ConfirmTicketResult | undefined> => {
      if (job.name !== CONFIRM_TICKET_JOB_NAMES.CONFIRM_TICKET) return;

      const { ticketId, clubId } = job.data;

      job.log(
        `[confirm-ticket] Starting confirmation for ticket ${ticketId} (club: ${clubId})`,
      );

      const result = await confirmTicketAndNotify(prisma, { ticketId, clubId });

      job.log(
        `[confirm-ticket] Ticket ${ticketId} — ${
          result.skipped ? `skipped: ${result.reason}` : `confirmed, email sent`
        }`,
      );

      return result;
    },
    {
      connection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as ConfirmTicketResult | undefined;
    if (r && !r.skipped) {
      console.info(
        `[confirm-ticket] Job ${job.id} (ticket: ${job.data.ticketId}) completed — email sent`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[confirm-ticket] Job ${job?.id} (ticket: ${job?.data?.ticketId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
