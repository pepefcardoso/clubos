/**
 * Job name constants used to route jobs within the lgpd-purge queue.
 * Both the dispatch cron trigger and the per-club purge jobs share a single
 * queue; the `name` field distinguishes which worker handler processes them.
 */
export const LGPD_PURGE_JOB_NAMES = {
  DISPATCH_LGPD_PURGE: "dispatch-lgpd-purge",
  PURGE_CLUB_CONSENT: "purge-club-consent",
} as const;

export type LgpdPurgeJobName =
  (typeof LGPD_PURGE_JOB_NAMES)[keyof typeof LGPD_PURGE_JOB_NAMES];

/**
 * Payload for the monthly cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchLgpdPurgeJobData {
  /**
   * ISO datetime string of when the dispatch was triggered.
   * Defaults to now() in the worker if absent.
   * Can be overridden for manual or backfill runs.
   * Used to derive the stable cutoff date for jobId deduplication.
   */
  triggeredAt?: string;
  /**
   * Retention window in months. Defaults to 24.
   * Exposed here so ops can run a manual job with a different window
   * without a code change (e.g. legal hold extension).
   */
  retentionMonths?: number;
}

/**
 * Payload for a per-club consent purge job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface PurgeClubConsentJobData {
  clubId: string;
  triggeredAt: string;
  /**
   * Computed cutoff ISO string forwarded from dispatch.
   * All clubs in a given monthly run use exactly the same cutoff timestamp,
   * ensuring reproducible audit evidence regardless of when each per-club
   * job actually runs within the batch.
   */
  purgeBeforeIso: string;
}
