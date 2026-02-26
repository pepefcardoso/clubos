/**
 * Job name constants used to route jobs within the charge-generation queue.
 * Both the dispatch cron trigger and the per-club generation jobs share a single
 * queue; the `name` field distinguishes which worker handler processes them.
 */
export const JOB_NAMES = {
  DISPATCH_MONTHLY_CHARGES: "dispatch-monthly-charges",
  GENERATE_CLUB_CHARGES: "generate-club-charges",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchMonthlyChargesPayload {
  /**
   * ISO date string of the billing period.
   * Defaults to the current month if absent.
   * Used when triggering a backfill or manual run for a specific month.
   */
  billingPeriod?: string;
}

/**
 * Payload for a per-club charge generation job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface GenerateClubChargesPayload {
  clubId: string;
  /** User ID or system actor that triggered this run. */
  actorId: string;
  /** Forwarded from DispatchMonthlyChargesPayload. */
  billingPeriod?: string;
}
