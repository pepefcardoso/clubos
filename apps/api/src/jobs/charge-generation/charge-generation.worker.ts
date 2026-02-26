import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  generateMonthlyCharges,
  markChargesPendingRetry,
  NoActivePlanError,
} from "../../modules/charges/charges.service.js";
import {
  JOB_NAMES,
  type GenerateClubChargesPayload,
} from "./charge-generation.types.js";
import type { ChargeGenerationResult } from "../../modules/charges/charges.schema.js";

/**
 * Starts the charge generation worker.
 *
 * Processes `generate-club-charges` jobs — one per club per billing period.
 * Calls `generateMonthlyCharges()` which already handles:
 *   - Idempotency via `hasExistingCharge()` (skips members already charged)
 *   - Per-member error isolation
 *   - Asaas gateway dispatch and gatewayMeta persistence (T-022)
 *
 * Concurrency is set to 5 per architecture-rules.md:
 *   "Jobs de cobrança rodam com concorrência máxima de 5"
 *
 * Backoff strategy (T-024):
 *   attempt 1 fails → wait  1h  → attempt 2
 *   attempt 2 fails → wait  6h  → attempt 3
 *   attempt 3 fails → wait 24h  → EXHAUSTED
 *   On exhaustion: all PENDING charges for the club/period → PENDING_RETRY
 *
 * Error handling strategy:
 *   - `NoActivePlanError` → the club has no active plans; the job fails and
 *     BullMQ retries with the custom backoff schedule. This is expected for
 *     clubs still in onboarding — retrying is appropriate and the job will
 *     eventually succeed once the club configures a plan.
 *   - Any other thrown error → job fails, BullMQ applies the custom backoff
 *     (1h / 6h / 24h, up to 3 attempts total, per queues.ts config).
 *   - `result.errors` (per-member DB failures) → job completes successfully.
 *     These are non-fatal: most members were charged; T-024 handles PENDING_RETRY.
 *   - `result.gatewayErrors` (gateway dispatch failures) → job completes
 *     successfully. Charges are persisted as PENDING; T-024 retry picks them up.
 */
export function startChargeGenerationWorker(): Worker {
  const connection = getRedisClient();
  const prisma = getPrismaClient();

  const worker = new Worker<GenerateClubChargesPayload>(
    "charge-generation",
    async (
      job: Job<GenerateClubChargesPayload>,
    ): Promise<ChargeGenerationResult | undefined> => {
      if (job.name !== JOB_NAMES.GENERATE_CLUB_CHARGES) return;

      const { clubId, actorId, billingPeriod } = job.data;

      job.log(`[generation] Club ${clubId} — starting charge generation`);

      let result: ChargeGenerationResult;

      try {
        result = await generateMonthlyCharges(prisma, clubId, actorId, {
          billingPeriod,
        });
      } catch (err) {
        if (err instanceof NoActivePlanError) {
          job.log(
            `[generation] Club ${clubId} — no active plan, job will be retried`,
          );
          throw err;
        }
        throw err;
      }

      job.log(
        `[generation] Club ${clubId} — ` +
          `generated: ${result.generated}, ` +
          `skipped: ${result.skipped}, ` +
          `errors: ${result.errors.length}, ` +
          `gatewayErrors: ${result.gatewayErrors.length}`,
      );

      if (result.errors.length > 0) {
        console.warn(
          `[generation] Club ${clubId} — ${result.errors.length} member error(s):`,
          result.errors,
        );
      }

      if (result.gatewayErrors.length > 0) {
        console.warn(
          `[generation] Club ${clubId} — ${result.gatewayErrors.length} gateway error(s):`,
          result.gatewayErrors,
        );
      }

      return result;
    },
    {
      connection,
      concurrency: 5,
      settings: {
        /**
         * Custom backoff delays per T-024 spec (architecture-rules.md):
         *   attempt 1 fails → wait  1h  → attempt 2
         *   attempt 2 fails → wait  6h  → attempt 3
         *   attempt 3 fails → wait 24h  → EXHAUSTED
         *
         * `attemptsMade` is the number of attempts already completed when
         * this function is called (1-indexed). After the first failure,
         * attemptsMade === 1; after the second, attemptsMade === 2; etc.
         *
         * Falls back to 24h for any unexpected attempt count (defensive).
         */
        backoffStrategy: (attemptsMade: number): number => {
          const DELAYS_MS = [
            1 * 60 * 60 * 1000,
            6 * 60 * 60 * 1000,
            24 * 60 * 60 * 1000,
          ] as const;
          return DELAYS_MS[attemptsMade - 1] ?? 24 * 60 * 60 * 1000;
        },
      },
    },
  );

  worker.on("completed", (job, result: unknown) => {
    const r = result as ChargeGenerationResult | undefined;
    if (r) {
      console.info(
        `[charge-generation] Job ${job.id} (club: ${job.data.clubId}) completed — ` +
          `generated: ${r.generated}, skipped: ${r.skipped}`,
      );
    }
  });

  /**
   * Fired on every failure (transient and final).
   *
   * When the job has exhausted all retry attempts (`attemptsMade >= attempts`),
   * we transition every PENDING charge in the billing period to PENDING_RETRY
   * so the treasurer can see them on the dashboard and act manually.
   *
   * The callback is async — BullMQ v5 supports async event handlers.
   * Errors thrown inside are emitted as 'error' on the worker, which would
   * crash the process, so we always wrap with try/catch and only log.
   */
  worker.on("failed", async (job, err) => {
    if (!job) return;

    const maxAttempts = job.opts.attempts ?? 3;
    const isExhausted = job.attemptsMade >= maxAttempts;

    console.error(
      `[charge-generation] Job ${job.id} (club: ${job.data?.clubId}) ` +
        `failed — attempt ${job.attemptsMade}/${maxAttempts}: ${err.message}`,
    );

    if (!isExhausted) return;

    const { clubId, billingPeriod } = job.data ?? {};
    if (!clubId) return;

    try {
      const { updated } = await markChargesPendingRetry(
        prisma,
        clubId,
        billingPeriod,
      );
      console.warn(
        `[charge-generation] Job ${job.id} exhausted — ` +
          `marked ${updated} charge(s) as PENDING_RETRY for club ${clubId}`,
      );
    } catch (markErr) {
      console.error(
        `[charge-generation] Failed to mark charges as PENDING_RETRY ` +
          `for club ${clubId}:`,
        markErr,
      );
    }
  });

  return worker;
}
