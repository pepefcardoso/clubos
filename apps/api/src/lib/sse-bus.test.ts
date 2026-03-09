import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sseBus,
  emitPaymentConfirmed,
  type SseBusEvent,
} from "../../src/lib/sse-bus.js";

describe("sse-bus", () => {
  beforeEach(() => {
    sseBus.removeAllListeners();
  });

  describe("emitPaymentConfirmed", () => {
    it("emits the correct event shape on the club channel", () => {
      const clubId = "club-abc";
      const listener = vi.fn();

      sseBus.on(`club:${clubId}`, listener);

      emitPaymentConfirmed(clubId, {
        chargeId: "charge-1",
        memberId: "member-1",
        amountCents: 14990,
        memberStatusUpdated: true,
        paidAt: "2025-03-01T14:32:00.000Z",
      });

      expect(listener).toHaveBeenCalledOnce();

      const event = listener.mock.calls[0]?.[0] as SseBusEvent;
      expect(event.type).toBe("PAYMENT_CONFIRMED");
      expect(event.clubId).toBe(clubId);
      expect(event.payload.chargeId).toBe("charge-1");
      expect(event.payload.memberId).toBe("member-1");
      expect(event.payload.amountCents).toBe(14990);
      expect(event.payload.memberStatusUpdated).toBe(true);
      expect(event.payload.paidAt).toBe("2025-03-01T14:32:00.000Z");
    });

    it("does not emit to other clubs' channels", () => {
      const clubA = "club-aaa";
      const clubB = "club-bbb";

      const listenerA = vi.fn();
      const listenerB = vi.fn();

      sseBus.on(`club:${clubA}`, listenerA);
      sseBus.on(`club:${clubB}`, listenerB);

      emitPaymentConfirmed(clubA, {
        chargeId: "charge-x",
        memberId: "member-x",
        amountCents: 5000,
        memberStatusUpdated: false,
        paidAt: new Date().toISOString(),
      });

      expect(listenerA).toHaveBeenCalledOnce();
      expect(listenerB).not.toHaveBeenCalled();
    });

    it("emits to all listeners on the same club channel", () => {
      const clubId = "club-multi";
      const listenerOne = vi.fn();
      const listenerTwo = vi.fn();

      sseBus.on(`club:${clubId}`, listenerOne);
      sseBus.on(`club:${clubId}`, listenerTwo);

      emitPaymentConfirmed(clubId, {
        chargeId: "charge-2",
        memberId: "member-2",
        amountCents: 9900,
        memberStatusUpdated: false,
        paidAt: new Date().toISOString(),
      });

      expect(listenerOne).toHaveBeenCalledOnce();
      expect(listenerTwo).toHaveBeenCalledOnce();
    });

    it("is a no-op when no listeners are registered for the club", () => {
      expect(() => {
        emitPaymentConfirmed("club-nobody", {
          chargeId: "charge-3",
          memberId: "member-3",
          amountCents: 100,
          memberStatusUpdated: false,
          paidAt: new Date().toISOString(),
        });
      }).not.toThrow();
    });
  });

  describe("listener cleanup", () => {
    it("does not fire after being removed with off()", () => {
      const clubId = "club-cleanup";
      const listener = vi.fn();

      sseBus.on(`club:${clubId}`, listener);
      sseBus.off(`club:${clubId}`, listener);

      emitPaymentConfirmed(clubId, {
        chargeId: "charge-4",
        memberId: "member-4",
        amountCents: 200,
        memberStatusUpdated: false,
        paidAt: new Date().toISOString(),
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it("maxListeners is set to 500 to support many concurrent SSE connections", () => {
      expect(sseBus.getMaxListeners()).toBe(500);
    });
  });
});
