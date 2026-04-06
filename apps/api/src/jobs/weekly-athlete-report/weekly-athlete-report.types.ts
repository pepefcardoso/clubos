/**
 * Job name constants used to route jobs within the weekly-athlete-report queue.
 * Both the dispatch cron trigger and the per-club send jobs share a single
 * queue; the `name` field distinguishes which worker handler processes them.
 */
export const WEEKLY_ATHLETE_REPORT_JOB_NAMES = {
  DISPATCH_WEEKLY_ATHLETE_REPORT: "dispatch-weekly-athlete-report",
  SEND_CLUB_WEEKLY_REPORT: "send-club-weekly-report",
} as const;

export type WeeklyAthleteReportJobName =
  (typeof WEEKLY_ATHLETE_REPORT_JOB_NAMES)[keyof typeof WEEKLY_ATHLETE_REPORT_JOB_NAMES];

/**
 * Payload for the weekly cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchWeeklyAthleteReportJobData {
  /**
   * ISO datetime string when the dispatch was triggered.
   * Defaults to now() if absent. Used to derive the stable ISO week key.
   * Can be overridden for manual or backfill runs.
   */
  triggeredAt?: string;
}

/**
 * Payload for a per-club weekly report send job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface SendClubWeeklyReportJobData {
  clubId: string;
  triggeredAt: string;
  /**
   * ISO week string derived from triggeredAt, e.g. "2025-W24".
   * Forwarded from dispatch so all clubs in one run share the same reference week.
   * Used for jobId deduplication and message content.
   */
  weekKey: string;
}
