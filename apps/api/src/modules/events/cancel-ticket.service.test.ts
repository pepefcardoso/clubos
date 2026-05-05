import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cancelTicket,
  TicketAlreadyCancelledError,
  TicketCheckedInError,
  TicketCancellationWindowError,
} from "./tickets.service.js";
import { NotFoundError } from "../../lib/errors.js";

const mockCancelCharge = vi.fn().mockResolvedValue(undefined);

vi.mock("../../payments/gateway.registry.js", () => ({
  GatewayRegistry: {
    get: vi.fn().mockReturnValue({ cancelCharge: mockCancelCharge }),
  },
}));

const mockAssertTicketExists = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertTicketExists: (...args: unknown[]) => mockAssertTicketExists(...args),
  assertEventExists: vi.fn().mockResolvedValue(undefined),
  assertEventSectorExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(),
  isPrismaUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

import * as prismaLib from "../../lib/prisma.js";

const withTenantSchemaMock = vi.mocked(prismaLib.withTenantSchema);

const mockTicket = (overrides: Record<string, unknown> = {}) => ({
  id: "ticket-1",
  status: "PENDING",
  checkedIn: false,
  sectorId: "sector-1",
  externalId: "gw-ext-1",
  gatewayName: "asaas",
  event: { eventDate: new Date(Date.now() + 48 * 60 * 60 * 1_000) },
  ...overrides,
});

type MockTx = {
  ticket: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  charge: { findFirst: ReturnType<typeof vi.fn> };
  payment: { updateMany: ReturnType<typeof vi.fn> };
  eventSector: { update: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
};

function makeTx(ticket: ReturnType<typeof mockTicket> | null): MockTx {
  return {
    ticket: {
      findUnique: vi.fn().mockResolvedValue(ticket),
      update: vi.fn().mockResolvedValue({}),
    },
    charge: {
      findFirst: vi.fn().mockResolvedValue({ id: "charge-1" }),
    },
    payment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    eventSector: {
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function setupWith(ticket: ReturnType<typeof mockTicket> | null): MockTx {
  const tx = makeTx(ticket);
  withTenantSchemaMock.mockImplementation(async (_prisma, _clubId, cb) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cb(tx as any),
  );
  return tx;
}

const PRISMA = null as never;
const CLUB_ID = "clubabc123456789012345";
const TICKET_ID = "ticket-1";
const ACTOR_ID = "user-admin-1";
const REASON = "Compra errada";

describe("cancelTicket()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertTicketExists.mockResolvedValue(undefined);
  });

  describe("happy path — PENDING ticket (no external charge)", () => {
    it("cancels ticket, decrements sold, creates audit log; does NOT call gateway", async () => {
      const tx = setupWith(mockTicket({ externalId: null, gatewayName: null }));

      await cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID);

      expect(tx.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TICKET_ID },
          data: expect.objectContaining({ status: "CANCELLED" }),
        }),
      );
      expect(tx.eventSector.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sector-1" },
          data: expect.objectContaining({ sold: { decrement: 1 } }),
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "TICKET_CANCELLED" }),
        }),
      );
      expect(mockCancelCharge).not.toHaveBeenCalled();
    });
  });

  describe("happy path — PAID ticket with gateway charge", () => {
    it("calls gateway.cancelCharge, soft-cancels Payment, updates ticket and sector", async () => {
      const tx = setupWith(mockTicket({ status: "PAID" }));

      await cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID);

      expect(mockCancelCharge).toHaveBeenCalledWith("gw-ext-1", REASON);
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancelReason: REASON }),
        }),
      );
      expect(tx.ticket.update).toHaveBeenCalled();
      expect(tx.eventSector.update).toHaveBeenCalled();
    });
  });

  describe("business rule — checkedIn", () => {
    it("throws TicketCheckedInError", async () => {
      setupWith(mockTicket({ checkedIn: true }));
      await expect(
        cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
      ).rejects.toBeInstanceOf(TicketCheckedInError);
    });
  });

  describe("business rule — already cancelled", () => {
    it("throws TicketAlreadyCancelledError", async () => {
      setupWith(mockTicket({ status: "CANCELLED" }));
      await expect(
        cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
      ).rejects.toBeInstanceOf(TicketAlreadyCancelledError);
    });
  });

  describe("business rule — 24h window", () => {
    it("throws TicketCancellationWindowError when event is < 24h away", async () => {
      setupWith(
        mockTicket({
          event: { eventDate: new Date(Date.now() + 12 * 60 * 60 * 1_000) },
        }),
      );
      await expect(
        cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
      ).rejects.toBeInstanceOf(TicketCancellationWindowError);
    });

    it("allows cancellation at 24h + 1s boundary", async () => {
      setupWith(
        mockTicket({
          event: {
            eventDate: new Date(Date.now() + 24 * 60 * 60 * 1_000 + 1_000),
          },
          externalId: null,
          gatewayName: null,
        }),
      );
      await expect(
        cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
      ).resolves.toBeUndefined();
    });
  });

  describe("security — tenant isolation", () => {
    it("throws NotFoundError when assertTicketExists rejects (cross-tenant ticket)", async () => {
      mockAssertTicketExists.mockRejectedValueOnce(
        new NotFoundError("Ingresso não encontrado."),
      );
      setupWith(null);
      await expect(
        cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("gateway failure", () => {
    it("propagates error without running Phase 3 (no DB mutation)", async () => {
      const tx = setupWith(mockTicket({ status: "PAID" }));
      mockCancelCharge.mockRejectedValueOnce(new Error("Gateway timeout"));

      await expect(
        cancelTicket(PRISMA, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
      ).rejects.toThrow("Gateway timeout");

      expect(tx.ticket.update).not.toHaveBeenCalled();
      expect(tx.eventSector.update).not.toHaveBeenCalled();
    });
  });
});
