import { Worker, type Job } from "bullmq";
import { getRedisClient } from "../../lib/redis.js";
import { getPrismaClient } from "../../lib/prisma.js";
import {
  generateMonthlyCharges,
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
 * Error handling strategy:
 *   - `NoActivePlanError` → the club has no active plans; the job fails and
 *     BullMQ retries with exponential backoff. This is expected for clubs still
 *     in onboarding — retrying is appropriate and the job will eventually succeed
 *     once the club configures a plan.
 *   - Any other thrown error → job fails, BullMQ applies the default retry policy
 *     (up to 3 attempts with 1h exponential backoff, per queues.ts config).
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

  worker.on("failed", (job, err) => {
    console.error(
      `[charge-generation] Job ${job?.id} (club: ${job?.data?.clubId}) ` +
        `failed after ${job?.attemptsMade} attempt(s):`,
      err.message,
    );
  });

  return worker;
}
