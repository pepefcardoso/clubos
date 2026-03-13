/**
 * Job name constants used to route jobs within the due-today-notices queue.
 * Both the dispatch cron trigger and the per-club notice jobs share a single
 * queue; the `name` field distinguishes which worker handler processes them.
 */
export const DUE_TODAY_NOTICE_JOB_NAMES = {
  DISPATCH_DUE_TODAY_NOTICES: "dispatch-due-today-notices",
  SEND_CLUB_DUE_TODAY_NOTICES: "send-club-due-today-notices",
} as const;

export type DueTodayNoticeJobName =
  (typeof DUE_TODAY_NOTICE_JOB_NAMES)[keyof typeof DUE_TODAY_NOTICE_JOB_NAMES];

/**
 * Payload for the top-level cron dispatch job.
 * No club-specific fields — the dispatch worker fetches all clubs at runtime.
 */
export interface DispatchDueTodayNoticesJobData {
  /**
   * ISO date string of the target due date (today). Optional — injected by
   * dispatch worker at runtime. Can be overridden for manual/backfill runs.
   */
  targetDate?: string;
}

/**
 * Payload for a per-club D-0 due-today notice job.
 * Enqueued by the dispatch worker, one job per club.
 */
export interface SendClubDueTodayNoticesJobData {
  clubId: string;
  /** ISO string — start of today (UTC midnight: 00:00:00.000) */
  targetDateStart: string;
  /** ISO string — end of today (UTC: 23:59:59.999) */
  targetDateEnd: string;
}
