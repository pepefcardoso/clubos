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
    };

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
