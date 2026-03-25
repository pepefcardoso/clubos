/**
 * Job name constants used to route jobs within the acwr-refresh queue.
 * Both the dispatch cron trigger and the per-club refresh jobs share a single
 * queue; the `name` field distinguishes which worker handler processes them.
 */
export const ACWR_REFRESH_JOB_NAMES = {
  DISPATCH_ACWR_REFRESH: "dispatch-acwr-refresh",
  REFRESH_CLUB_ACWR: "refresh-club-acwr",
} as const;

export type AcwrRefreshJobName =
  (typeof ACWR_REFRESH_JOB_NAMES)[keyof typeof ACWR_REFRESH_JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchAcwrRefreshJobData {
  /**
   * ISO datetime string of when the dispatch was triggered.
   * Defaults to now() in the worker if absent.
   * Can be overridden for manual or backfill runs.
   * Used to derive the stable 4-hour window key for jobId deduplication.
   */
  triggeredAt?: string;
}

/**
 * Payload for a per-club ACWR refresh job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface RefreshClubAcwrJobData {
  clubId: string;
  /**
   * ISO datetime string forwarded from the dispatch job.
   * Used to derive the stable 4-hour window key for jobId deduplication.
   */
  triggeredAt?: string;
}
