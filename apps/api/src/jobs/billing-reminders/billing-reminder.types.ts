/**
 * Job name constants used to route jobs within the billing-reminders queue.
 * Both the dispatch cron trigger and the per-club reminder jobs share a single
 * queue; the `name` field distinguishes which worker handler processes them.
 */
export const BILLING_REMINDER_JOB_NAMES = {
  DISPATCH_DAILY_REMINDERS: "dispatch-daily-reminders",
  SEND_CLUB_REMINDERS: "send-club-reminders",
} as const;

export type BillingReminderJobName =
  (typeof BILLING_REMINDER_JOB_NAMES)[keyof typeof BILLING_REMINDER_JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchDailyRemindersJobData {
  /**
   * ISO date string of the target due date (today+3). Optional — injected by
   * dispatch worker at runtime. Can be overridden for manual/backfill runs.
   */
  targetDate?: string;
}

/**
 * Payload for a per-club billing reminder job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface SendClubRemindersJobData {
  clubId: string;
  /** ISO string — start of the D+3 target day (UTC midnight: 00:00:00.000) */
  targetDateStart: string;
  /** ISO string — end of the D+3 target day (UTC: 23:59:59.999) */
  targetDateEnd: string;
}
