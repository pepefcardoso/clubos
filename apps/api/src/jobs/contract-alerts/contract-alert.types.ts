/**
 * Job name constants used to route jobs within the contract-alerts queue.
 * Both the dispatch cron trigger and the per-club contract alert jobs share
 * a single queue; the `name` field distinguishes which worker handler processes them.
 */
export const CONTRACT_ALERT_JOB_NAMES = {
  DISPATCH_CONTRACT_ALERTS: "dispatch-contract-alerts",
  SEND_CLUB_CONTRACT_ALERTS: "send-club-contract-alerts",
} as const;

export type ContractAlertJobName =
  (typeof CONTRACT_ALERT_JOB_NAMES)[keyof typeof CONTRACT_ALERT_JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchContractAlertsJobData {
  /**
   * ISO date string of the reference date (today). Optional — injected by
   * the dispatch worker at runtime. Can be overridden for manual/backfill runs.
   */
  targetDate?: string;
}

/**
 * Payload for a per-club contract alert job.
 * Enqueued by the dispatch worker, one job per club.
 *
 * Four date fields are required because this job handles two distinct
 * expiry windows (D-7 and D-1) in a single pass — computing them once
 * in the dispatch worker avoids clock skew between individual club jobs.
 */
export interface SendClubContractAlertsJobData {
  clubId: string;
  /** ISO string — start of today+7 target day (UTC midnight: 00:00:00.000) */
  d7DateStart: string;
  /** ISO string — end of today+7 target day (UTC: 23:59:59.999) */
  d7DateEnd: string;
  /** ISO string — start of today+1 target day (UTC midnight: 00:00:00.000) */
  d1DateStart: string;
  /** ISO string — end of today+1 target day (UTC: 23:59:59.999) */
  d1DateEnd: string;
}
