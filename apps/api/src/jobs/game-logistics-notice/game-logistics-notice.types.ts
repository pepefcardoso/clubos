export const GAME_LOGISTICS_NOTICE_JOB_NAMES = {
  SEND_GAME_LOGISTICS_NOTICE: "send-game-logistics-notice",
} as const;

export type GameLogisticsNoticeJobName =
  (typeof GAME_LOGISTICS_NOTICE_JOB_NAMES)[keyof typeof GAME_LOGISTICS_NOTICE_JOB_NAMES];

export interface GameLogisticsNoticeJobData {
  clubId: string;
  eventId: string;
}

export interface GameLogisticsNoticeResult {
  clubId: string;
  sent: number;
  skipped: number;
  reason?: string;
  errors?: string[];
}
