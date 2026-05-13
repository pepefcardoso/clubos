import { EventEmitter } from "node:events";
import type { ShowcaseTier } from "@clubos/shared-types";

export interface PaymentConfirmedPayload {
  chargeId: string;
  memberId: string;
  amountCents: number;
  memberStatusUpdated: boolean;
  paidAt: string;
}

export interface CheckinConfirmedPayload {
  ticketId: string;
  eventId: string;
  fanName: string;
  sectorName: string;
  checkedInAt: string;
}

export interface TicketSoldPayload {
  ticketId: string;
  eventId: string;
  sectorId: string;
  sectorName: string;
  fanName: string;
}

export interface EventCapacityUpdatedPayload {
  eventId: string;
  sectorId: string;
  sold: number;
  capacity: number;
  available: number;
}

export interface ShowcaseUpdatedPayload {
  showcaseId: string;
  athleteId: string;
  tier: ShowcaseTier;
}

export interface ContactRequestReceivedPayload {
  contactRequestId: string;
  athleteId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  reason?: string | undefined;
}

export type SseBusEvent =
  | {
      type: "PAYMENT_CONFIRMED";
      clubId: string;
      payload: PaymentConfirmedPayload;
    }
  | {
      type: "CHECKIN_CONFIRMED";
      clubId: string;
      payload: CheckinConfirmedPayload;
    }
  | { type: "TICKET_SOLD"; clubId: string; payload: TicketSoldPayload }
  | {
      type: "EVENT_CAPACITY_UPDATED";
      clubId: string;
      payload: EventCapacityUpdatedPayload;
    }
  | {
      type: "SHOWCASE_UPDATED";
      clubId: string;
      payload: ShowcaseUpdatedPayload;
    }
  | {
      type: "CONTACT_REQUEST_RECEIVED";
      clubId: string;
      payload: ContactRequestReceivedPayload;
    }
  | {
      type: "CONTACT_REQUEST_RECEIVED";
      scoutId: string;
      payload: ContactRequestReceivedPayload;
    };

/**
 * In-process pub/sub bus for SSE connections.
 *
 * Channel naming:
 *   club:{clubId}   — events for authenticated club users
 *   scout:{scoutId} — events for authenticated scouts
 *
 * Scaling note:
 *   SseBus uses Node.js EventEmitter. This is acceptable for single-process deployments.
 *   For multi-process (horizontal scale): replace sseBus.emit/on/off with
 *   redis.publish(channel, payload) / redis.subscribe(channel, handler).
 *   The exported function signatures (emitXxx) and channel naming (club:* / scout:*)
 *   MUST remain identical — callers have no knowledge of the transport.
 */
class SseBus extends EventEmitter {}

export const sseBus = new SseBus();
sseBus.setMaxListeners(500);

export function emitPaymentConfirmed(
  clubId: string,
  payload: PaymentConfirmedPayload,
): void {
  const event: SseBusEvent = { type: "PAYMENT_CONFIRMED", clubId, payload };
  sseBus.emit(`club:${clubId}`, event);
}

export function emitCheckinConfirmed(
  clubId: string,
  payload: CheckinConfirmedPayload,
): void {
  const event: SseBusEvent = { type: "CHECKIN_CONFIRMED", clubId, payload };
  sseBus.emit(`club:${clubId}`, event);
}

export function emitTicketSold(
  clubId: string,
  payload: TicketSoldPayload,
): void {
  const event: SseBusEvent = { type: "TICKET_SOLD", clubId, payload };
  sseBus.emit(`club:${clubId}`, event);
}

export function emitEventCapacityUpdated(
  clubId: string,
  payload: EventCapacityUpdatedPayload,
): void {
  const event: SseBusEvent = {
    type: "EVENT_CAPACITY_UPDATED",
    clubId,
    payload,
  };
  sseBus.emit(`club:${clubId}`, event);
}

export function emitShowcaseUpdated(
  clubId: string,
  payload: ShowcaseUpdatedPayload,
): void {
  const event: SseBusEvent = { type: "SHOWCASE_UPDATED", clubId, payload };
  sseBus.emit(`club:${clubId}`, event);
}

/** Notify club dashboard when a scout creates a contact request. T-172 call site. */
export function emitContactRequestReceivedToClub(
  clubId: string,
  payload: ContactRequestReceivedPayload,
): void {
  const event: SseBusEvent = {
    type: "CONTACT_REQUEST_RECEIVED",
    clubId,
    payload,
  };
  sseBus.emit(`club:${clubId}`, event);
}

/** Notify scout when a club accepts or rejects their contact request. T-173 call site. */
export function emitContactRequestReceivedToScout(
  scoutId: string,
  payload: ContactRequestReceivedPayload,
): void {
  const event: SseBusEvent = {
    type: "CONTACT_REQUEST_RECEIVED",
    scoutId,
    payload,
  };
  sseBus.emit(`scout:${scoutId}`, event);
}
