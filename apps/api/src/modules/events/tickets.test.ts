import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  purchaseTicket,
  getPublicEventDetails,
  cancelTicket,
  TicketAlreadyCancelledError,
  TicketCheckedInError,
  TicketCancellationWindowError,
} from "./tickets.service.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_p: unknown, _c: string, fn: (tx: unknown) => unknown) =>
      fn(makeTenantTx()),
  ),
  isPrismaUniqueConstraintError: vi.fn(() => false),
}));

vi.mock("../../lib/assert-tenant-ownership.js", () => ({
  assertEventExists: vi.fn().mockResolvedValue(undefined),
  assertEventSectorExists: vi.fn().mockResolvedValue(undefined),
  assertTicketExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/sse-bus.js", () => ({
  emitTicketSold: vi.fn(),
  emitCheckinConfirmed: vi.fn(),
  emitEventCapacityUpdated: vi.fn(),
}));

vi.mock("../../jobs/queues.js", () => ({
  confirmTicketQueue: { add: vi.fn().mockResolvedValue(undefined) },
  fanFunnelQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../payments/gateway.registry.js", () => ({
  GatewayRegistry: {
    forMethod: vi.fn(),
    get: vi.fn(),
    _reset: vi.fn(),
  },
}));

import {
  withTenantSchema,
  isPrismaUniqueConstraintError,
} from "../../lib/prisma.js";
import {
  assertEventExists,
  assertEventSectorExists,
  assertTicketExists,
} from "../../lib/assert-tenant-ownership.js";
import { GatewayRegistry } from "../payments/gateway.registry.js";

const CLUB_ID = "clubabc123456789012345";
const CLUB_SLUG = "my-club";
const EVENT_ID = "evt_01";
const SECTOR_ID = "sec_01";

const BASE_SECTOR = {
  id: SECTOR_ID,
  name: "Arquibancada",
  capacity: 200,
  sold: 100,
  priceCents: 2000,
};

const GATEWAY_RESULT = {
  externalId: "gw_txn_001",
  status: "PENDING" as const,
  meta: { qrCodeBase64: "abc123", pixCopyPaste: "00020126..." },
};

const VALID_INPUT = {
  sectorId: SECTOR_ID,
  fanName: "João Silva",
  fanEmail: "joao@example.com",
  fanPhone: "48991234567",
  fanCpf: "12345678901",
};

function makeTenantTx(
  overrides: {
    event?: object | null;
    sector?: object | null;
    ticketCreateError?: Error;
    existingTicket?: object | null;
  } = {},
) {
  const event =
    overrides.event === undefined ? { status: "SCHEDULED" } : overrides.event;
  const sector =
    overrides.sector === undefined ? BASE_SECTOR : overrides.sector;

  return {
    event: { findUnique: vi.fn().mockResolvedValue(event) },
    eventSector: { findUnique: vi.fn().mockResolvedValue(sector) },
    ticket: {
      create: overrides.ticketCreateError
        ? vi.fn().mockRejectedValue(overrides.ticketCreateError)
        : vi.fn().mockResolvedValue({
            id: "tkt_01",
            fanEmail: VALID_INPUT.fanEmail,
          }),
      findFirst: vi.fn().mockResolvedValue(
        overrides.existingTicket ?? {
          id: "tkt_existing",
          fanEmail: VALID_INPUT.fanEmail,
        },
      ),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({
        id: "tkt_01",
        eventId: EVENT_ID,
        status: "PENDING",
        checkedIn: false,
        sectorId: SECTOR_ID,
        externalId: null,
        gatewayName: null,
        event: { eventDate: new Date(Date.now() + 48 * 60 * 60 * 1_000) },
      }),
    },
    fanProfile: { upsert: vi.fn().mockResolvedValue({}) },
    eventSectorUpdate: vi.fn().mockResolvedValue({}),
    charge: { findFirst: vi.fn().mockResolvedValue(null) },
    payment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function mockGateway(result = GATEWAY_RESULT) {
  const gateway = {
    name: "asaas",
    supportedMethods: ["PIX"] as const,
    createCharge: vi.fn().mockResolvedValue(result),
    cancelCharge: vi.fn().mockResolvedValue(undefined),
    parseWebhook: vi.fn(),
  };
  vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);
  vi.mocked(GatewayRegistry.get).mockReturnValue(gateway as never);
  return gateway;
}

const mockPrisma = {
  club: { findUnique: vi.fn().mockResolvedValue({ id: CLUB_ID }) },
} as unknown as Parameters<typeof purchaseTicket>[0];

function useTenant(overrides: Parameters<typeof makeTenantTx>[0] = {}) {
  vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
    fn(makeTenantTx(overrides) as unknown as Parameters<typeof fn>[0]),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withTenantSchema).mockImplementation((_p, _c, fn) =>
    fn(makeTenantTx() as unknown as Parameters<typeof fn>[0]),
  );
  vi.mocked(isPrismaUniqueConstraintError).mockReturnValue(false);
  vi.mocked(assertEventExists).mockResolvedValue(undefined);
  vi.mocked(assertEventSectorExists).mockResolvedValue(undefined);
  vi.mocked(assertTicketExists).mockResolvedValue(undefined);
});

describe("getPublicEventDetails", () => {
  it("returns public event shape with available capacity", async () => {
    const txEvent = {
      id: EVENT_ID,
      opponent: "Flamengo",
      eventDate: new Date(),
      venue: "Arena",
      description: null,
      status: "SCHEDULED",
      sponsorName: null,
      sponsorLogoUrl: null,
      sponsorCtaUrl: null,
      sectors: [
        {
          id: SECTOR_ID,
          name: "Geral",
          priceCents: 2000,
          capacity: 100,
          sold: 40,
        },
      ],
    };
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn({
        event: { findUnique: vi.fn().mockResolvedValue(txEvent) },
      } as never),
    );

    const result = await getPublicEventDetails(mockPrisma, CLUB_SLUG, EVENT_ID);

    expect(result.sectors[0]!.available).toBe(60);
    expect(Number.isInteger(result.sectors[0]!.priceCents)).toBe(true);
  });

  it("throws NotFoundError when club slug is unknown", async () => {
    const badPrisma = {
      club: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never;

    await expect(
      getPublicEventDetails(badPrisma, "unknown-club", EVENT_ID),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError (not available) when event is CANCELLED — hides existence [SEC-OBJ]", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn({
        event: {
          findUnique: vi.fn().mockResolvedValue({
            id: EVENT_ID,
            status: "CANCELLED",
            sectors: [],
          }),
        },
      } as never),
    );

    await expect(
      getPublicEventDetails(mockPrisma, CLUB_SLUG, EVENT_ID),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("purchaseTicket — happy path", () => {
  it("returns response with integer amountCents [FIN] and gatewayMeta", async () => {
    mockGateway();
    const result = await purchaseTicket(
      mockPrisma,
      CLUB_SLUG,
      EVENT_ID,
      VALID_INPUT,
    );

    expect(result.ticketId).toBe("tkt_01");
    expect(result.status).toBe("PENDING");
    expect(result.amountCents).toBe(2000);
    expect(Number.isInteger(result.amountCents)).toBe(true);
    expect(result.gatewayMeta.qrCodeBase64).toBe("abc123");
  });

  it("calls GatewayRegistry.forMethod('PIX') — never concrete gateway", async () => {
    mockGateway();
    await purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT);

    expect(GatewayRegistry.forMethod).toHaveBeenCalledWith("PIX");
    expect(GatewayRegistry.forMethod).toHaveBeenCalledTimes(1);
  });

  it("passes idempotencyKey = ticket.id to gateway", async () => {
    const gw = mockGateway();
    await purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT);

    expect(gw.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "tkt_01" }),
    );
  });
});

describe("purchaseTicket — error paths", () => {
  it("throws NotFoundError when clubSlug is unknown", async () => {
    const badPrisma = {
      club: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never;

    await expect(
      purchaseTicket(badPrisma, "unknown-club", EVENT_ID, VALID_INPUT),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError when event status is CANCELLED", async () => {
    mockGateway();
    useTenant({ event: { status: "CANCELLED" } });

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when event status is COMPLETED", async () => {
    mockGateway();
    useTenant({ event: { status: "COMPLETED" } });

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when event does not exist (assertEventExists)", async () => {
    mockGateway();
    vi.mocked(assertEventExists).mockRejectedValueOnce(
      new NotFoundError("Evento não encontrado."),
    );

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when sectorId belongs to a different event [SEC-OBJ]", async () => {
    mockGateway();
    vi.mocked(assertEventSectorExists).mockRejectedValueOnce(
      new NotFoundError("Setor não encontrado."),
    );

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError when sector is at full capacity", async () => {
    mockGateway();
    useTenant({ sector: { ...BASE_SECTOR, sold: 200, capacity: 200 } });

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow(ValidationError);
  });

  it("propagates gateway error without swallowing", async () => {
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue({
      name: "asaas",
      createCharge: vi.fn().mockRejectedValue(new Error("Gateway timeout")),
    } as never);

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow("Gateway timeout");
  });

  it("cross-tenant isolation — returns NotFoundError never 403 [SEC-TEN]", async () => {
    mockGateway();
    vi.mocked(assertEventExists).mockRejectedValueOnce(
      new NotFoundError("Evento não encontrado."),
    );

    const err = await purchaseTicket(
      mockPrisma,
      CLUB_SLUG,
      "foreign-event-id",
      VALID_INPUT,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as Error).constructor.name).not.toBe("ForbiddenError");
  });
});

describe("purchaseTicket — idempotency", () => {
  it("returns existing ticketId on duplicate unique constraint", async () => {
    mockGateway();
    const uniqueErr = new Error("Unique constraint failed");
    vi.mocked(isPrismaUniqueConstraintError).mockReturnValue(true);
    useTenant({ ticketCreateError: uniqueErr });

    const result = await purchaseTicket(
      mockPrisma,
      CLUB_SLUG,
      EVENT_ID,
      VALID_INPUT,
    );

    expect(result.ticketId).toBe("tkt_existing");
  });

  it("throws when existing ticket lookup also fails after constraint error", async () => {
    mockGateway();
    const uniqueErr = new Error("Unique constraint failed");
    vi.mocked(isPrismaUniqueConstraintError).mockReturnValue(true);
    useTenant({ ticketCreateError: uniqueErr, existingTicket: null });

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow();
  });
});

describe("cancelTicket", () => {
  const TICKET_ID = "tkt_01";
  const ACTOR_ID = "user-admin-1";
  const REASON = "Compra errada";

  function makeCancelTx(
    overrides: {
      status?: string;
      checkedIn?: boolean;
      externalId?: string | null;
      gatewayName?: string | null;
      eventDate?: Date;
    } = {},
  ) {
    const ticket = {
      id: TICKET_ID,
      eventId: EVENT_ID,
      status: overrides.status ?? "PENDING",
      checkedIn: overrides.checkedIn ?? false,
      sectorId: SECTOR_ID,
      externalId: overrides.externalId ?? null,
      gatewayName: overrides.gatewayName ?? null,
      event: {
        eventDate:
          overrides.eventDate ?? new Date(Date.now() + 48 * 60 * 60 * 1_000),
      },
    };
    return {
      ticket: {
        findUnique: vi.fn().mockResolvedValue(ticket),
        update: vi.fn().mockResolvedValue({}),
      },
      charge: { findFirst: vi.fn().mockResolvedValue(null) },
      payment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      eventSector: {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ sold: 99, capacity: 200 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  it("cancels PENDING ticket without calling gateway", async () => {
    const tx = makeCancelTx();
    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, cb) =>
      cb(tx as never),
    );

    await cancelTicket(mockPrisma, CLUB_ID, TICKET_ID, REASON, ACTOR_ID);

    expect(tx.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect(GatewayRegistry.get).not.toHaveBeenCalled();
  });

  it("calls gateway.cancelCharge and soft-cancels Payment for PAID ticket", async () => {
    const gw = mockGateway();
    const tx = makeCancelTx({
      status: "PAID",
      externalId: "gw-ext-1",
      gatewayName: "asaas",
    });
    tx.charge.findFirst = vi.fn().mockResolvedValue({ id: "charge-1" });
    tx.payment.updateMany = vi.fn().mockResolvedValue({ count: 1 });

    let callCount = 0;
    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, cb) => {
      callCount++;
      return cb(tx as never);
    });

    await cancelTicket(mockPrisma, CLUB_ID, TICKET_ID, REASON, ACTOR_ID);

    expect(gw.cancelCharge).toHaveBeenCalledWith("gw-ext-1", REASON);
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cancelReason: REASON }),
      }),
    );
  });

  it("throws TicketCheckedInError for checked-in ticket", async () => {
    const tx = makeCancelTx({ checkedIn: true });
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, cb) =>
      cb(tx as never),
    );

    await expect(
      cancelTicket(mockPrisma, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
    ).rejects.toBeInstanceOf(TicketCheckedInError);
  });

  it("throws TicketAlreadyCancelledError when already cancelled", async () => {
    const tx = makeCancelTx({ status: "CANCELLED" });
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, cb) =>
      cb(tx as never),
    );

    await expect(
      cancelTicket(mockPrisma, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
    ).rejects.toBeInstanceOf(TicketAlreadyCancelledError);
  });

  it("throws TicketCancellationWindowError when event is < 24h away", async () => {
    const tx = makeCancelTx({
      eventDate: new Date(Date.now() + 12 * 60 * 60 * 1_000),
    });
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, cb) =>
      cb(tx as never),
    );

    await expect(
      cancelTicket(mockPrisma, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
    ).rejects.toBeInstanceOf(TicketCancellationWindowError);
  });

  it("allows cancellation at exactly 24h + 1s boundary", async () => {
    const tx = makeCancelTx({
      eventDate: new Date(Date.now() + 24 * 60 * 60 * 1_000 + 1_000),
    });
    vi.mocked(withTenantSchema).mockImplementation(async (_p, _c, cb) =>
      cb(tx as never),
    );

    await expect(
      cancelTicket(mockPrisma, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
    ).resolves.toBeUndefined();
  });

  it("throws NotFoundError for cross-tenant ticket access — never 403 [SEC-OBJ]", async () => {
    vi.mocked(assertTicketExists).mockRejectedValueOnce(
      new NotFoundError("Ingresso não encontrado."),
    );
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, cb) =>
      cb(makeCancelTx() as never),
    );

    const err = await cancelTicket(
      mockPrisma,
      CLUB_ID,
      "ticket-from-club-b",
      REASON,
      ACTOR_ID,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as Error).constructor.name).not.toBe("ForbiddenError");
  });

  it("propagates gateway error without running DB mutations [FIN]", async () => {
    const gw = mockGateway();
    gw.cancelCharge = vi.fn().mockRejectedValue(new Error("Gateway timeout"));

    const tx = makeCancelTx({
      status: "PAID",
      externalId: "gw-ext-1",
      gatewayName: "asaas",
    });
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, cb) =>
      cb(tx as never),
    );

    await expect(
      cancelTicket(mockPrisma, CLUB_ID, TICKET_ID, REASON, ACTOR_ID),
    ).rejects.toThrow("Gateway timeout");

    expect(tx.ticket.update).not.toHaveBeenCalled();
  });
});
