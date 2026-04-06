import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  LGPD_PURGE_JOB_NAMES,
  type PurgeClubConsentJobData,
} from "./lgpd-purge.types.js";
import {
  purgeExpiredConsentRecords,
  type LgpdPurgeResult,
} from "./lgpd-purge.service.js";

/**
 * Starts the per-club LGPD consent record purge worker.
 *
 * Processes `purge-club-consent` jobs — one per club per monthly run.
 * Calls `purgeExpiredConsentRecords()` which performs a hard DELETE of
 * PARENTAL_CONSENT_RECORDED audit_log rows older than the cutoff date.
 *
 * Concurrency = 3: each job is a simple DELETE on a small subset of rows
 * (consent records are infrequent — at most a handful per club per month).
 * Lower than financial workers (5) because this is non-critical background
 * work; we want minimal DB pressure during the 03:00 UTC maintenance window.
 *
 * Idempotency: DELETE WHERE createdAt < cutoff is always safe to re-run.
 * A retry after partial failure re-deletes only rows that survived the
 * first attempt — no duplicates, no data loss.
 *
 * Error policy:
 *   - DB errors from `purgeExpiredConsentRecords` are re-thrown so BullMQ
 *     applies the configured exponential backoff (max 2 attempts as set in
 *     lgpdPurgeQueue).
 *   - One club failure does NOT abort other clubs in the same cron wave.
 *   - On exhaustion, the rows persist until the next monthly run, which is
 *     acceptable — LGPD does not require sub-minute erasure.
 *
 * Scope:
 *   Only `PARENTAL_CONSENT_RECORDED` rows are touched. Financial and
 *   operational audit_log entries are immutable by architecture rule.
 */
export function startLgpdPurgeWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<PurgeClubConsentJobData>(
    "lgpd-purge",
    async (
      job: Job<PurgeClubConsentJobData>,
    ): Promise<LgpdPurgeResult | undefined> => {
      if (job.name !== LGPD_PURGE_JOB_NAMES.PURGE_CLUB_CONSENT) return;

      const { clubId, purgeBeforeIso } = job.data;
      const purgeBefore = new Date(purgeBeforeIso);

      job.log(
        `[lgpd-purge] Club ${clubId} — starting consent purge, ` +
          `cutoff: ${purgeBeforeIso}`,
      );

      const result = await purgeExpiredConsentRecords(
        prisma,
        clubId,
        purgeBefore,
      );

      job.log(
        `[lgpd-purge] Club ${clubId} — deleted ${result.deleted} ` +
          `consent record(s) in ${result.durationMs}ms`,
      );

      return result;
    },
    { connection, concurrency: 3 },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as LgpdPurgeResult | undefined;
    if (r) {
      console.info(
        `[lgpd-purge] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `deleted: ${r.deleted}, durationMs: ${r.durationMs}ms`,
      );
    }
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[lgpd-purge] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed — attempt ${job?.attemptsMade}: ${err.message}`,
    );
  });

  return worker;
}
