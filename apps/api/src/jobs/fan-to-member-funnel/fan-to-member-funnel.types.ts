export const FAN_FUNNEL_JOB_NAMES = {
  SEND_FAN_CONVERSION: "send-fan-conversion",
} as const;

export type FanFunnelJobName =
  (typeof FAN_FUNNEL_JOB_NAMES)[keyof typeof FAN_FUNNEL_JOB_NAMES];

/**
 * BullMQ payload for fan conversion funnel jobs.
 * IDs only — fan contact details are resolved inside the worker. [SEC-JOB]
 */
export interface SendFanConversionJobData {
  ticketId: string;
  eventId: string;
  clubId: string;
}

export type FanConversionResult =
  | { fanProfileId: string; status: "SENT" }
  | { fanProfileId: string; status: "SKIPPED"; reason: string }
  | { fanProfileId: string; status: "FAILED"; reason: string };
