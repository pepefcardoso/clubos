import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sseBus,
  emitPaymentConfirmed,
  emitTicketSold,
  emitEventCapacityUpdated,
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
      if (event.type !== "PAYMENT_CONFIRMED") throw new Error("wrong type");
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

describe("emitTicketSold", () => {
  it("emits the correct event shape on the club channel", () => {
    const clubId = "club-ts1";
    const listener = vi.fn();

    sseBus.on(`club:${clubId}`, listener);

    emitTicketSold(clubId, {
      ticketId: "ticket-1",
      eventId: "event-1",
      sectorId: "sector-1",
      sectorName: "Arquibancada",
      fanName: "João Silva",
    });

    expect(listener).toHaveBeenCalledOnce();

    const event = listener.mock.calls[0]?.[0] as SseBusEvent;
    expect(event.type).toBe("TICKET_SOLD");
    expect(event.clubId).toBe(clubId);
    if (event.type !== "TICKET_SOLD") throw new Error("wrong type");
    expect(event.payload.ticketId).toBe("ticket-1");
    expect(event.payload.sectorName).toBe("Arquibancada");
  });

  it("does not emit to other clubs' channels", () => {
    const clubA = "club-ts-aaa";
    const clubB = "club-ts-bbb";
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    sseBus.on(`club:${clubA}`, listenerA);
    sseBus.on(`club:${clubB}`, listenerB);

    emitTicketSold(clubA, {
      ticketId: "t",
      eventId: "e",
      sectorId: "s",
      sectorName: "N",
      fanName: "F",
    });

    expect(listenerA).toHaveBeenCalledOnce();
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("is a no-op when no listeners are registered", () => {
    expect(() => {
      emitTicketSold("club-nobody-ts", {
        ticketId: "t",
        eventId: "e",
        sectorId: "s",
        sectorName: "N",
        fanName: "F",
      });
    }).not.toThrow();
  });
});

describe("emitEventCapacityUpdated", () => {
  it("emits the correct event shape on the club channel", () => {
    const clubId = "club-ecu1";
    const listener = vi.fn();

    sseBus.on(`club:${clubId}`, listener);

    emitEventCapacityUpdated(clubId, {
      eventId: "event-1",
      sectorId: "sector-1",
      sold: 11,
      capacity: 100,
      available: 89,
    });

    expect(listener).toHaveBeenCalledOnce();

    const event = listener.mock.calls[0]?.[0] as SseBusEvent;
    expect(event.type).toBe("EVENT_CAPACITY_UPDATED");
    expect(event.clubId).toBe(clubId);
    if (event.type !== "EVENT_CAPACITY_UPDATED") throw new Error("wrong type");
    expect(event.payload.sold).toBe(11);
    expect(event.payload.available).toBe(89);
  });

  it("does not emit to other clubs' channels", () => {
    const clubA = "club-ecu-aaa";
    const clubB = "club-ecu-bbb";
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    sseBus.on(`club:${clubA}`, listenerA);
    sseBus.on(`club:${clubB}`, listenerB);

    emitEventCapacityUpdated(clubA, {
      eventId: "e",
      sectorId: "s",
      sold: 1,
      capacity: 10,
      available: 9,
    });

    expect(listenerA).toHaveBeenCalledOnce();
    expect(listenerB).not.toHaveBeenCalled();
  });

  it("is a no-op when no listeners are registered", () => {
    expect(() => {
      emitEventCapacityUpdated("club-nobody-ecu", {
        eventId: "e",
        sectorId: "s",
        sold: 0,
        capacity: 10,
        available: 10,
      });
    }).not.toThrow();
  });
});
