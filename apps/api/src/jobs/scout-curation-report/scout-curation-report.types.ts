export const SCOUT_CURATION_REPORT_JOB_NAMES = {
  DISPATCH_SCOUT_CURATION_REPORT: "dispatch-scout-curation-report",
  GENERATE_SCOUT_CURATION_REPORT: "generate-scout-curation-report",
} as const;

export type ScoutCurationReportJobName =
  (typeof SCOUT_CURATION_REPORT_JOB_NAMES)[keyof typeof SCOUT_CURATION_REPORT_JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No scout-specific fields — the dispatch worker fetches all ACTIVE scouts at runtime.
 */
export interface DispatchCurationReportJobData {
  /**
   * Optional ISO date string for backfill/manual runs.
   * yearMonth will be the calendar month containing this date.
   * Defaults to new Date() at runtime.
   */
  targetDate?: string;
}

/**
 * Payload for a per-scout curation report generation job.
 * IDs only — no PII, email, name, or saved filters. [SEC-JOB]
 */
export interface GenerateScoutCurationReportJobData {
  scoutId: string;
  /** ISO "YYYY-MM" string — the reporting month, e.g. "2025-03" */
  yearMonth: string;
}
