import { EventEmitter } from "node:events";

export interface PaymentConfirmedPayload {
  chargeId: string;
  memberId: string;
  amountCents: number;
  memberStatusUpdated: boolean;
  paidAt: string;
}

export interface SseBusEvent {
  type: "PAYMENT_CONFIRMED";
  clubId: string;
  payload: PaymentConfirmedPayload;
}

class SseBus extends EventEmitter {}

export const sseBus = new SseBus();
sseBus.setMaxListeners(500);

/**
 * Emits a club-scoped event on the SSE bus.
 * Called by the webhook worker after a successful PAYMENT_RECEIVED.
 *
 * Events are namespaced as `club:{clubId}` so each SSE listener only
 * receives events for the club it is authenticated against — cross-club
 * leakage is structurally impossible at the bus level.
 *
 * Scaling note: For multi-process deployments, replace this function's body
 * with a Redis `PUBLISH club:{clubId} <json>` call. The SSE route's
 * `sseBus.on(channel, onEvent)` becomes a Redis `SUBSCRIBE`. The interface
 * stays identical; only this file and events.routes.ts change.
 */
export function emitPaymentConfirmed(
  clubId: string,
  payload: PaymentConfirmedPayload,
): void {
  const event: SseBusEvent = { type: "PAYMENT_CONFIRMED", clubId, payload };
  sseBus.emit(`club:${clubId}`, event);
}
