/**
 * Job name constants used to route jobs within the monthly-report queue.
 * Both the dispatch cron trigger and the per-club report jobs share a single
 * queue; the `name` field distinguishes which worker handler processes them.
 */
export const MONTHLY_REPORT_JOB_NAMES = {
  DISPATCH_MONTHLY_REPORT: "dispatch-monthly-report",
  GENERATE_CLUB_MONTHLY_REPORT: "generate-club-monthly-report",
} as const;

export type MonthlyReportJobName =
  (typeof MONTHLY_REPORT_JOB_NAMES)[keyof typeof MONTHLY_REPORT_JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchMonthlyReportJobData {
  /**
   * Optional ISO date string injected for manual/backfill runs.
   * The target period will be the calendar month PRIOR to this date.
   * Defaults to new Date() at runtime.
   */
  targetDate?: string;
}

/**
 * Payload for a per-club monthly report generation job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface GenerateClubMonthlyReportJobData {
  clubId: string;
  /** ISO "YYYY-MM" string — the month being reported on, e.g. "2025-03" */
  reportPeriod: string;
  /** ISO string — UTC midnight of the first day of the reporting month */
  periodStart: string;
  /** ISO string — UTC 23:59:59.999 of the last day of the reporting month */
  periodEnd: string;
}
