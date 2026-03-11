import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  CONTRACT_ALERT_JOB_NAMES,
  type SendClubContractAlertsJobData,
} from "./contract-alert.types.js";
import {
  sendContractAlertsForClub,
  type ContractAlertResult,
} from "./contract-alert.service.js";

/**
 * Starts the per-club contract alert worker.
 *
 * Processes `send-club-contract-alerts` jobs — one per club per day.
 * Calls `sendContractAlertsForClub()` which handles:
 *   - D-7 contract expiry alerts (endDate in 7 days)
 *   - D-1 contract expiry alerts (endDate tomorrow)
 *   - BID-pending notices (ACTIVE contracts with bidRegistered=false), batched
 *     into a single email per club to prevent admin email floods
 *   - Idempotency via audit_log (20h window per contract per alertType)
 *   - Per-contract error isolation
 *
 * Concurrency = 5 per architecture-rules.md:
 *   "Jobs de cobrança rodam com concorrência máxima de 5"
 *   Contract alert jobs are low-volume admin email jobs (not member WhatsApp),
 *   but we adopt the same cap for consistency.
 *
 * No rate-limit retry logic — contract alerts use email (not WhatsApp),
 * so there is no 30 msgs/min sliding window concern.
 *
 * Error propagation:
 *   - Per-contract send failures are captured in result.errors[] — job completes.
 *   - System-level failures (Resend not configured, Prisma connection lost) propagate
 *     upward and mark the BullMQ job as failed, triggering retry.
 */
export function startContractAlertWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<SendClubContractAlertsJobData>(
    "contract-alerts",
    async (
      job: Job<SendClubContractAlertsJobData>,
    ): Promise<ContractAlertResult | undefined> => {
      if (job.name !== CONTRACT_ALERT_JOB_NAMES.SEND_CLUB_CONTRACT_ALERTS)
        return;

      const { clubId, d7DateStart, d7DateEnd, d1DateStart, d1DateEnd } =
        job.data;

      job.log(
        `[contract-alert] Club ${clubId} — starting daily contract alert job`,
      );

      const result = await sendContractAlertsForClub(
        prisma,
        clubId,
        new Date(d7DateStart),
        new Date(d7DateEnd),
        new Date(d1DateStart),
        new Date(d1DateEnd),
      );

      job.log(
        `[contract-alert] Club ${clubId} — ` +
          `expiryD7Sent: ${result.expiryD7Sent}, ` +
          `expiryD1Sent: ${result.expiryD1Sent}, ` +
          `bidPendingSent: ${result.bidPendingSent}, ` +
          `skipped: ${result.skipped}, ` +
          `errors: ${result.errors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn(
          `[contract-alert] Club ${clubId} — ${result.errors.length} error(s):`,
          result.errors,
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
    const r = result as ContractAlertResult | undefined;
    if (r) {
      console.info(
        `[contract-alert] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `D-7: ${r.expiryD7Sent}, D-1: ${r.expiryD1Sent}, ` +
          `BID: ${r.bidPendingSent}, skipped: ${r.skipped}`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[contract-alert] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
