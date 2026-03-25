import type { Worker } from "bullmq";
import {
  chargeGenerationQueue,
  billingReminderQueue,
  overdueNoticeQueue,
  contractAlertQueue,
  acwrRefreshQueue,
} from "./queues.js";
import { startChargeDispatchWorker } from "./charge-generation/charge-dispatch.worker.js";
import { startChargeGenerationWorker } from "./charge-generation/charge-generation.worker.js";
import { startWebhookWorker } from "../modules/webhooks/webhooks.worker.js";
import { startBillingReminderDispatchWorker } from "./billing-reminders/billing-reminder-dispatch.worker.js";
import { startBillingReminderWorker } from "./billing-reminders/billing-reminder.worker.js";
import { startOverdueNoticeDispatchWorker } from "./overdue-notices/overdue-notice-dispatch.worker.js";
import { startOverdueNoticeWorker } from "./overdue-notices/overdue-notice.worker.js";
import { startContractAlertDispatchWorker } from "./contract-alerts/contract-alert-dispatch.worker.js";
import { startContractAlertWorker } from "./contract-alerts/contract-alert.worker.js";
import { startAcwrRefreshDispatchWorker } from "./acwr-refresh/acwr-refresh-dispatch.worker.js";
import { startAcwrRefreshWorker } from "./acwr-refresh/acwr-refresh.worker.js";
import { JOB_NAMES } from "./charge-generation/charge-generation.types.js";
import { BILLING_REMINDER_JOB_NAMES } from "./billing-reminders/billing-reminder.types.js";
import { OVERDUE_NOTICE_JOB_NAMES } from "./overdue-notices/overdue-notice.types.js";
import { CONTRACT_ALERT_JOB_NAMES } from "./contract-alerts/contract-alert.types.js";
import { ACWR_REFRESH_JOB_NAMES } from "./acwr-refresh/acwr-refresh.types.js";
import { dueTodayNoticeQueue } from "./queues.js";
import { startDueTodayNoticeDispatchWorker } from "./due-today-notices/due-today-notice-dispatch.worker.js";
import { startDueTodayNoticeWorker } from "./due-today-notices/due-today-notice.worker.js";
import { DUE_TODAY_NOTICE_JOB_NAMES } from "./due-today-notices/due-today-notice.types.js";

/**
 * Cron expression: 1st of every month at 08:00 UTC.
 * Standard 5-field cron: minute hour day-of-month month day-of-week
 */
const CHARGE_GENERATION_CRON = "0 8 1 * *";

/**
 * Cron expression: every day at 09:00 UTC (06:00 BRT).
 * Sends D-3 billing reminders for charges due in 3 days.
 */
const D3_REMINDER_CRON = "0 9 * * *";

/**
 * Cron expression: every day at 10:00 UTC (07:00 BRT).
 * Sends D+3 overdue notices for charges that were due 3 days ago and remain unpaid.
 * Intentionally 1 hour after the D-3 reminder cron to avoid both queues competing
 * for per-club WhatsApp rate-limit slots simultaneously.
 */
const OVERDUE_NOTICE_CRON = "0 10 * * *";

/**
 * Cron expression: every day at 08:00 UTC (05:00 BRT).
 * Sends D-0 due-today notices for charges whose dueDate is today.
 * Fires one hour before the D-3 reminder cron (09:00 UTC) so all four
 * morning queues are staggered and never compete for per-club
 * WhatsApp rate-limit slots simultaneously.
 */
const DUE_TODAY_NOTICE_CRON = "0 8 * * *";

/**
 * Cron expression: every day at 11:00 UTC (08:00 BRT).
 * Sends contract expiry alerts (D-7, D-1) and BID-pending notices to club admins.
 * Staggered 1h after the overdue notice cron (10:00 UTC) to spread DB and Redis
 * load across the morning. Email-only — no WhatsApp rate-limit contention.
 */
const CONTRACT_ALERT_CRON = "0 11 * * *";

/**
 * Cron expression: every 4 hours at :00 UTC.
 * Fires at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC.
 * Refreshes the acwr_aggregates materialized view for all registered clubs.
 * Data lag between a new workload_metric insert and its ACWR aggregation
 * is at most 4 hours under normal conditions, ≤ 8h in worst-case retry.
 */
const ACWR_REFRESH_CRON = "0 */4 * * *";

/**
 * Stable job ID for the charge generation cron entry.
 * BullMQ uses this to upsert (not duplicate) the repeatable job across
 * application restarts.
 */
const CHARGE_CRON_JOB_ID = "monthly-charge-dispatch-cron";

/**
 * Stable job ID for the D-3 reminder cron entry.
 * Prevents duplicate registrations on restart.
 */
const D3_REMINDER_CRON_ID = "daily-d3-reminder-cron";

/**
 * Stable job ID for the D+3 overdue notice cron entry.
 * Prevents duplicate registrations on restart.
 */
const OVERDUE_NOTICE_CRON_ID = "daily-overdue-notice-cron";

/**
 * Stable job ID for the D-0 due-today notice cron entry.
 * Prevents duplicate registrations on restart.
 */
const DUE_TODAY_NOTICE_CRON_ID = "daily-due-today-notice-cron";

/**
 * Stable job ID for the daily contract alert cron entry.
 * Prevents duplicate registrations on restart.
 */
const CONTRACT_ALERT_CRON_ID = "daily-contract-alert-cron";

/**
 * Stable job ID for the ACWR refresh cron entry.
 * Prevents duplicate cron registrations on restart.
 */
const ACWR_REFRESH_CRON_ID = "acwr-refresh-cron";

/**
 * Module-level reference to started workers.
 * Used by `closeJobs()` to gracefully drain and close all workers.
 */
const _workers: Worker[] = [];

/**
 * Registers all BullMQ workers and scheduled cron jobs.
 *
 * **Must be called once** during application startup (inside `buildApp()`).
 *
 * Workers started:
 *   1.  Charge dispatch worker (concurrency=1) — processes the monthly cron trigger,
 *       fans out one job per club.
 *   2.  Charge generation worker (concurrency=5) — calls `generateMonthlyCharges()`
 *       for each club.
 *   3.  Webhook worker (concurrency=5) — processes incoming payment gateway
 *       events from the "webhook-events" BullMQ queue.
 *   4.  Billing reminder dispatch worker (concurrency=1) — processes the daily
 *       D-3 cron trigger, fans out one reminder job per club.
 *   5.  Billing reminder worker (concurrency=5) — sends WhatsApp D-3 reminders
 *       for each club's PENDING charges due in 3 days.
 *   6.  Overdue notice dispatch worker (concurrency=1) — processes the daily
 *       D+3 cron trigger, fans out one overdue notice job per club.
 *   7.  Overdue notice worker (concurrency=5) — sends WhatsApp D+3 overdue notices
 *       for each club's PENDING/OVERDUE charges due 3 days ago.
 *   8.  Contract alert dispatch worker (concurrency=1) — processes the daily
 *       11:00 UTC cron trigger, fans out one contract alert job per club.
 *   9.  Contract alert worker (concurrency=5) — sends email alerts to club ADMIN
 *       users for contracts expiring in 7 or 1 days, and batched BID-pending
 *       notices for athletes whose BID/CBF registration is not yet confirmed.
 *   10. Due-today notice dispatch worker (concurrency=1) — processes the daily
 *       08:00 UTC cron trigger, fans out one due-today notice job per club.
 *   11. Due-today notice worker (concurrency=5) — sends WhatsApp D-0 notices
 *       for each club's PENDING charges due today.
 *   12. ACWR refresh dispatch worker (concurrency=1) — processes the 4-hourly
 *       cron trigger, fans out one `refresh-club-acwr` job per club.
 *   13. ACWR refresh worker (concurrency=3) — calls `refreshAcwrAggregates()`
 *       for each club to keep the acwr_aggregates materialized view current.
 *       Concurrency is 3 (lower than financial workers) because REFRESH
 *       MATERIALIZED VIEW is a full-scan DB operation that can hold an
 *       exclusive lock on the view during the non-concurrent (first-run) path.
 *
 * Cron registration is **skipped in test environments** (`NODE_ENV=test`) to
 * prevent polluting the test Redis instance with repeatable job entries that
 * would interfere with unrelated test runs.
 *
 * All `upsertJobScheduler` calls are idempotent across restarts — BullMQ will
 * update the existing repeatable job entry rather than creating a duplicate.
 *
 * Morning cron schedule (UTC):
 *   08:00 — D-0  due-today-notices
 *   09:00 — D-3  billing-reminders
 *   10:00 — D+3  overdue-notices
 *   11:00 — contract-alerts
 *
 * Background cron schedule (UTC):
 *   00:00, 04:00, 08:00, 12:00, 16:00, 20:00 — ACWR aggregate refresh
 */
export async function registerJobs(): Promise<void> {
  _workers.push(startChargeDispatchWorker());
  _workers.push(startChargeGenerationWorker());
  _workers.push(startWebhookWorker());
  _workers.push(startBillingReminderDispatchWorker());
  _workers.push(startBillingReminderWorker());
  _workers.push(startOverdueNoticeDispatchWorker());
  _workers.push(startOverdueNoticeWorker());
  _workers.push(startContractAlertDispatchWorker());
  _workers.push(startContractAlertWorker());
  _workers.push(startDueTodayNoticeDispatchWorker());
  _workers.push(startDueTodayNoticeWorker());
  _workers.push(startAcwrRefreshDispatchWorker());
  _workers.push(startAcwrRefreshWorker());

  if (process.env["NODE_ENV"] !== "test") {
    await chargeGenerationQueue.upsertJobScheduler(
      CHARGE_CRON_JOB_ID,
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

    await billingReminderQueue.upsertJobScheduler(
      D3_REMINDER_CRON_ID,
      { pattern: D3_REMINDER_CRON },
      {
        name: BILLING_REMINDER_JOB_NAMES.DISPATCH_DAILY_REMINDERS,
        data: {},
        opts: {
          attempts: 1,
        },
      },
    );
    console.info(
      `[jobs] D-3 reminder cron registered: "${D3_REMINDER_CRON}" (UTC)`,
    );

    await overdueNoticeQueue.upsertJobScheduler(
      OVERDUE_NOTICE_CRON_ID,
      { pattern: OVERDUE_NOTICE_CRON },
      {
        name: OVERDUE_NOTICE_JOB_NAMES.DISPATCH_OVERDUE_NOTICES,
        data: {},
        opts: {
          attempts: 1,
        },
      },
    );
    console.info(
      `[jobs] Overdue notice cron registered: "${OVERDUE_NOTICE_CRON}" (UTC)`,
    );

    await dueTodayNoticeQueue.upsertJobScheduler(
      DUE_TODAY_NOTICE_CRON_ID,
      { pattern: DUE_TODAY_NOTICE_CRON },
      {
        name: DUE_TODAY_NOTICE_JOB_NAMES.DISPATCH_DUE_TODAY_NOTICES,
        data: {},
        opts: {
          attempts: 1,
        },
      },
    );
    console.info(
      `[jobs] D-0 due-today notice cron registered: "${DUE_TODAY_NOTICE_CRON}" (UTC)`,
    );

    await contractAlertQueue.upsertJobScheduler(
      CONTRACT_ALERT_CRON_ID,
      { pattern: CONTRACT_ALERT_CRON },
      {
        name: CONTRACT_ALERT_JOB_NAMES.DISPATCH_CONTRACT_ALERTS,
        data: {},
        opts: {
          attempts: 1,
        },
      },
    );
    console.info(
      `[jobs] Contract alert cron registered: "${CONTRACT_ALERT_CRON}" (UTC)`,
    );

    await acwrRefreshQueue.upsertJobScheduler(
      ACWR_REFRESH_CRON_ID,
      { pattern: ACWR_REFRESH_CRON },
      {
        name: ACWR_REFRESH_JOB_NAMES.DISPATCH_ACWR_REFRESH,
        data: {},
        opts: {
          attempts: 1,
        },
      },
    );
    console.info(
      `[jobs] ACWR refresh cron registered: "${ACWR_REFRESH_CRON}" (UTC)`,
    );
  }
}

/**
 * Gracefully shuts down all registered workers and closes all queues.
 *
 * Called from the Fastify `onClose` hook to ensure in-flight jobs are
 * allowed to complete before the process exits.
 *
 * Workers are closed in parallel to minimise shutdown latency.
 * Queues are closed last to allow workers to finish their current jobs.
 */
export async function closeJobs(): Promise<void> {
  await Promise.all(_workers.map((w) => w.close()));
  await chargeGenerationQueue.close();
  await billingReminderQueue.close();
  await overdueNoticeQueue.close();
  await dueTodayNoticeQueue.close();
  await contractAlertQueue.close();
  await acwrRefreshQueue.close();
  console.info("[jobs] All workers and queues closed");
}
