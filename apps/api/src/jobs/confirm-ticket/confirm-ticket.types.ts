export const CONFIRM_TICKET_JOB_NAMES = {
  CONFIRM_TICKET: "confirm-ticket",
} as const;

export type ConfirmTicketJobName =
  (typeof CONFIRM_TICKET_JOB_NAMES)[keyof typeof CONFIRM_TICKET_JOB_NAMES];

/**
 * BullMQ payload for ticket confirmation jobs.
 * IDs only — fan contact details are fetched inside the worker. [SEC-JOB]
 */
export interface ConfirmTicketJobData {
  ticketId: string;
  clubId: string;
}

export type ConfirmTicketResult =
  | { skipped: true; reason: string }
  | { skipped: false; sent: true; ticketId: string; qrToken: string };
