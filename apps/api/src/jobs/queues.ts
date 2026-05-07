import { Queue } from "bullmq";
import { getRedisClient } from "../lib/redis.js";

const connection = getRedisClient();

/**
 * Single queue for all charge-generation jobs (dispatch + per-club generation).
 *
 * Keeping both job types in one queue:
 * - Simplifies monitoring in Bull Board / BullMQ UI.
 * - Enforces a single concurrency cap across all charge work.
 * - Avoids the overhead of managing multiple QueueSchedulers.
 *
 * Retry strategy:
 *   attempt 1 → wait  1h  → attempt 2
 *   attempt 2 → wait  6h  → attempt 3
 *   attempt 3 → wait 24h  → EXHAUSTED → charges set to PENDING_RETRY
 *
 * Backoff type is "custom" — the actual per-attempt delays are resolved by
 * the Worker's `settings.backoffStrategy` function in charge-generation.worker.ts.
 * The queue only needs to declare the type as "custom" as a signal to BullMQ.
 */
export const chargeGenerationQueue = new Queue("charge-generation", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 3,
    backoff: {
      type: "custom",
    },
  },
});

/**
 * Queue for all billing reminder jobs (daily dispatch + per-club WhatsApp sends).
 *
 * Separate from `charge-generation` to allow:
 * - Independent concurrency caps and retry policies.
 * - Isolated monitoring — reminder failures don't pollute charge job metrics.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 5s  → attempt 2 (exponential: 10s, 20s, …)
 *   Max 2 attempts — more retries risk duplicate sends if the failure was partial.
 *
 * Rate-limit triggered retries are handled by the worker throwing when
 * all charges were blocked; BullMQ applies the backoff automatically.
 */
export const billingReminderQueue = new Queue("billing-reminders", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
  },
});

/**
 * Queue for D+3 overdue notice jobs (daily dispatch + per-club WhatsApp sends).
 *
 * Separate from `billingReminderQueue` for:
 * - Independent monitoring — overdue notice failures are distinct from D-3
 *   reminder failures and must not pollute each other's metrics.
 * - Independent retry policies and concurrency tuning.
 * - Avoiding resource contention: the D-3 reminder cron (09:00 UTC) and the
 *   overdue notice cron (10:00 UTC) are intentionally staggered so both queues
 *   do not compete for per-club WhatsApp rate-limit slots simultaneously.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 5s → attempt 2 (exponential backoff).
 *   Max 2 attempts — same reasoning as billing reminders (duplicate send risk).
 */
export const overdueNoticeQueue = new Queue("overdue-notices", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
  },
});

/**
 * Queue for D-0 due-today notice jobs (daily dispatch + per-club WhatsApp sends).
 *
 * Fires at 08:00 UTC (05:00 BRT) — one hour before the D-3 reminder cron
 * (09:00 UTC) so all four morning queues are staggered to avoid competing
 * for per-club WhatsApp rate-limit slots simultaneously:
 *
 *   08:00 UTC — D-0  due-today-notices   ← this queue
 *   09:00 UTC — D-3  billing-reminders
 *   10:00 UTC — D+3  overdue-notices
 *   11:00 UTC — contract-alerts
 *
 * Separate from `billingReminderQueue` and `overdueNoticeQueue` for:
 * - Independent monitoring — D-0 failures are distinct from D-3 and D+3.
 * - Independent retry policies and concurrency tuning.
 * - Isolated failure metrics — one broken club does not pollute others.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 5s → attempt 2 (exponential backoff).
 *   Max 2 attempts — same duplicate-send risk rationale as the D-3 queue.
 */
export const dueTodayNoticeQueue = new Queue("due-today-notices", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
  },
});

/**
 * Queue for contract expiry (D-7, D-1) and BID-pending alert jobs.
 *
 * Separate from `billingReminderQueue` and `overdueNoticeQueue` because:
 * - Different recipient: club ADMIN users (public schema), not members.
 * - Email-only delivery — no WhatsApp rate-limit concern.
 * - Low volume: at most a handful of alerts per ACTIVE contract per day.
 * - Independent monitoring — contract alert failures should not pollute
 *   member-billing job metrics.
 *
 * Cron scheduled at 11:00 UTC (08:00 BRT), staggered 1h after the overdue
 * notice cron (10:00 UTC) to spread DB and Redis load across the morning.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 10s → attempt 2 (exponential backoff).
 *   Max 2 attempts — email send failures are often auth/config issues
 *   (non-retriable), so a short retry window is preferred over flooding
 *   the queue with zombie jobs.
 */
export const contractAlertQueue = new Queue("contract-alerts", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 10_000,
    },
  },
});

/**
 * Queue for ACWR (Acute:Chronic Workload Ratio) materialized view refresh jobs.
 *
 * Fires every 4 hours for all registered clubs (dispatch + per-club refresh).
 * Separate from all other queues because:
 *   - Different cadence: 4-hourly, not daily or monthly.
 *   - Non-financial: failures are not critical — a missed refresh means data
 *     lags by up to 8h in the worst case, which is acceptable for ACWR dashboards.
 *   - `REFRESH MATERIALIZED VIEW` is a full-scan DB operation that holds an
 *     exclusive lock on the view during the non-concurrent path. Isolating it
 *     avoids starving financial job workers during peak-load refreshes.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 30s → attempt 2 (exponential backoff) → EXHAUSTED.
 *   On exhaustion the view will be refreshed naturally on the next 4-hour cron
 *   tick, keeping worst-case data lag ≤ 8 hours.
 */
export const acwrRefreshQueue = new Queue("acwr-refresh", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 30_000,
    },
  },
});

/**
 * Queue for monthly LGPD consent record purge jobs.
 *
 * Runs on the 1st of every month at 03:00 UTC.
 * Performs hard-delete of PARENTAL_CONSENT_RECORDED audit_log rows
 * older than 24 months (LGPD Art. 15 / Art. 16 compliance).
 *
 * Separate from all operational queues because:
 *   - Different cadence: monthly, not daily.
 *   - Destructive operation — isolated to prevent any interference with
 *     financial or messaging job processing.
 *   - Low volume: at most a few dozen rows per club per run.
 *
 * Schedule: 1st of every month at 03:00 UTC — maintenance window after all
 * daily jobs (08:00–11:00 UTC previous day) and between 4-hourly ACWR cycles.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 30s → attempt 2 → EXHAUSTED.
 *   On exhaustion the rows persist until the next monthly run, which is
 *   acceptable — LGPD does not require sub-minute erasure.
 */
export const lgpdPurgeQueue = new Queue("lgpd-purge", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 30_000,
    },
  },
});

/**
 * Queue for weekly athlete report jobs (Monday dispatch + per-club WhatsApp sends).
 *
 * Fires every Monday at 08:00 UTC (05:00 BRT).
 * Compiles 7-day attendance + RPE stats per athlete and dispatches a formatted
 * summary to the athlete's guardian via WhatsApp.
 *
 * Separate from all operational queues because:
 *   - Different cadence: weekly, not daily or monthly.
 *   - Non-financial: a missed report is acceptable — athletes simply receive
 *     no summary that week; no financial or compliance impact.
 *   - Low volume: at most a handful of athletes per club per week.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 30s → attempt 2 → EXHAUSTED.
 *   On exhaustion the report is simply skipped until next Monday — acceptable
 *   since this is a non-critical informational job.
 */
export const weeklyAthleteReportQueue = new Queue("weekly-athlete-report", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 30_000,
    },
  },
});

/**
 * Queue for monthly financial report PDF generation and email dispatch.
 *
 * Fires on the 2nd of every month at 07:00 UTC (04:00 BRT).
 * Generates a PDF summary of the previous month's revenue, expenses,
 * balance and delinquency, then emails it to all ADMIN users per club.
 *
 * Separate from all operational queues because:
 *   - Different cadence: monthly, not daily.
 *   - Non-critical: a failed report is informational only; no financial impact.
 *   - PDF generation is CPU/memory-intensive — isolation prevents starving
 *     financial workers during peak-load generation.
 *
 * Runs on the 2nd (not the 1st) to ensure all end-of-month payments and
 * charges from the 1st have settled before the previous month's data is
 * compiled. This also avoids competing with the charge generation cron
 * (1st at 08:00 UTC).
 *
 * Morning cron schedule context (UTC):
 *   01st 08:00 — charge generation
 *   02nd 07:00 — monthly report  ← this queue
 *
 * Retry strategy:
 *   attempt 1 fails → wait 30s → attempt 2 → EXHAUSTED.
 *   On exhaustion the report is simply skipped until next month —
 *   acceptable since this is a non-critical informational job.
 */
export const monthlyReportQueue = new Queue("monthly-report", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 30_000,
    },
  },
});

/**
 * Queue for ticket payment confirmation jobs.
 *
 * Enqueued by the webhook worker when a gateway event with
 * externalReference `ticket:{ticketId}` is received.
 *
 * Each job:
 *   1. Updates ticket status to PAID
 *   2. Generates a deterministic HMAC-SHA256 QR token
 *   3. Sends a confirmation email with the QR code to the fan
 *
 * Retry strategy:
 *   attempt 1 fails → wait 1s → attempt 2 (exponential: 2s, 4s)
 *   Max 3 attempts — email delivery failures should surface quickly.
 *   confirmTicketAndNotify() is idempotent: retries do not re-send
 *   if the ticket is already PAID.
 */
export const confirmTicketQueue = new Queue("confirm-ticket", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000,
    },
  },
});

/**
 * Queue for fan-to-member funnel conversion emails.
 *
 * Enqueued by validateTicket() immediately after a successful check-in.
 * Each job:
 *   1. Resolves the FanProfile by ticket fanEmail inside the tenant schema
 *   2. Checks Redis dedup (30-day TTL per fan+event pair)
 *   3. Renders and sends the fan_conversion email via Resend
 *   4. Writes to audit_log (entityType = "FanProfile")
 *
 * Not event-driven by cron — purely triggered by gate scanner check-ins.
 * Email-only delivery: no WhatsApp rate-limit concern.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 5s → attempt 2 (exponential backoff).
 *   On failure, service clears the Redis dedup key so the retry can proceed.
 *   Max 2 attempts — duplicate send risk is low (dedup cleared on failure).
 */
export const fanFunnelQueue = new Queue("fan-to-member-funnel", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5_000,
    },
  },
});

/**
 * Queue for game logistics notice emails.
 *
 * Not cron-driven — each job is enqueued on-demand with a computed delay by
 * event-management.service.ts when an event is created or its date changes.
 * The job fires 48h before eventDate and emails all club ADMIN users with:
 *   - Match details (opponent, date, venue)
 *   - Full active athlete roster
 *
 * jobId = `game-logistics-{eventId}` — BullMQ deduplication.
 * Removing + re-adding on date change is handled by the service.
 *
 * Email-only delivery: no WhatsApp rate-limit concern.
 *
 * Retry strategy:
 *   attempt 1 fails → wait 30s → attempt 2 → EXHAUSTED.
 *   On exhaustion the notice is simply skipped — informational only.
 */
export const gameLogisticsNoticeQueue = new Queue("game-logistics-notice", {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 30_000,
    },
  },
});
