import type { Worker } from "bullmq";
import { chargeGenerationQueue } from "./queues.js";
import { startChargeDispatchWorker } from "./charge-generation/charge-dispatch.worker.js";
import { startChargeGenerationWorker } from "./charge-generation/charge-generation.worker.js";
import { startWebhookWorker } from "../modules/webhooks/webhooks.worker.js";
import { JOB_NAMES } from "./charge-generation/charge-generation.types.js";
/**
 * Cron expression: 1st of every month at 08:00 UTC.
 * Standard 5-field cron: minute hour day-of-month month day-of-week
 */
const CHARGE_GENERATION_CRON = "0 8 1 * *";
/**
 * Stable job ID for the repeatable cron entry.
 * BullMQ uses this to upsert (not duplicate) the repeatable job across
 * application restarts. Without a stable ID, every restart would register
 * an additional copy of the same cron trigger.
 */
const CRON_JOB_ID = "monthly-charge-dispatch-cron";
/**
 * Module-level reference to started workers.
 * Used by `closeJobs()` to gracefully drain and close all workers.
 */
const _workers: Worker[] = [];
/**
 * Registers all BullMQ workers and the monthly charge generation cron.
 *
 * **Must be called once** during application startup (inside `buildApp()`).
 *
 * Workers started:
 *   1. Charge dispatch worker (concurrency=1) — processes the cron trigger,
 *      fans out one job per club.
 *   2. Charge generation worker (concurrency=5) — calls `generateMonthlyCharges()`
 *      for each club.
 *   3. Webhook worker (concurrency=5) — processes incoming payment gateway
 *      events from the "webhook-events" BullMQ queue (T-028).
 *
 * Cron registration is **skipped in test environments** (`NODE_ENV=test`) to
 * prevent polluting the test Redis instance with repeatable job entries that
 * would interfere with unrelated test runs.
 *
 * The `upsertJobScheduler` call is idempotent across restarts — BullMQ will
 * update the existing repeatable job entry rather than creating a duplicate.
 */
export async function registerJobs(): Promise<void> {
  _workers.push(startChargeDispatchWorker());
  _workers.push(startChargeGenerationWorker());
  _workers.push(startWebhookWorker());

  if (process.env["NODE_ENV"] !== "test") {
    await chargeGenerationQueue.upsertJobScheduler(
      CRON_JOB_ID,
      { pattern: CHARGE_GENERATION_CRON },
      {
        name: JOB_NAMES.DISPATCH_MONTHLY_CHARGES,
        data: {},
        opts: {
          attempts: 1,
        },
      },
    );
    console.info(
      `[jobs] Monthly charge generation cron registered: "${CHARGE_GENERATION_CRON}" (UTC)`,
    );
  }
}
/**
 * Gracefully shuts down all registered workers and closes the queue.
 *
 * Called from the Fastify `onClose` hook to ensure in-flight jobs are
 * allowed to complete before the process exits.
 *
 * Workers are closed in parallel to minimise shutdown latency.
 * The queue is closed last to allow workers to finish their current jobs.
 */
export async function closeJobs(): Promise<void> {
  await Promise.all(_workers.map((w) => w.close()));
  await chargeGenerationQueue.close();
  console.info("[jobs] All workers and queues closed");
}
