/**
 * Job name constants used to route jobs within the overdue-notices queue.
 * Both the dispatch cron trigger and the per-club overdue notice jobs share
 * a single queue; the `name` field distinguishes which worker handler processes them.
 */
export const OVERDUE_NOTICE_JOB_NAMES = {
  DISPATCH_OVERDUE_NOTICES: "dispatch-overdue-notices",
  SEND_CLUB_OVERDUE_NOTICES: "send-club-overdue-notices",
} as const;

export type OverdueNoticeJobName =
  (typeof OVERDUE_NOTICE_JOB_NAMES)[keyof typeof OVERDUE_NOTICE_JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchOverdueNoticesJobData {
  /**
   * ISO date string of the reference date (today). Optional — injected by
   * dispatch worker at runtime. Can be overridden for manual/backfill runs.
   */
  targetDate?: string;
}

/**
 * Payload for a per-club overdue notice job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface SendClubOverdueNoticesJobData {
  clubId: string;
  /** ISO string — start of D-3 target day (UTC midnight: 00:00:00.000) */
  targetDateStart: string;
  /** ISO string — end of D-3 target day (UTC: 23:59:59.999) */
  targetDateEnd: string;
}
