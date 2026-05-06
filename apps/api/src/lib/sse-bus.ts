import { EventEmitter } from "node:events";

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
