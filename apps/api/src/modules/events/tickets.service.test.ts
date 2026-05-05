import { describe, it, expect, vi, beforeEach } from "vitest";
import { purchaseTicket } from "./tickets.service.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { GatewayRegistry } from "../payments/gateway.registry.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) =>
      fn(makeTenantTx()),
  ),
  isPrismaUniqueConstraintError: vi.fn(() => false),
}));

vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertEventExists: vi.fn().mockResolvedValue(undefined),
  assertEventSectorExists: vi.fn().mockResolvedValue(undefined),
}));

import {
  withTenantSchema,
  isPrismaUniqueConstraintError,
} from "../../lib/prisma.js";
import {
  assertEventExists,
  assertEventSectorExists,
} from "../../lib/assert-tenant-ownership.js";

const CLUB_SLUG = "my-club";
const CLUB_ID = "clubabc123456789012345";
const EVENT_ID = "evt_01";
const SECTOR_ID = "sec_01";

const BASE_SECTOR = {
  id: SECTOR_ID,
  name: "Arquibancada",
  capacity: 200,
  sold: 100,
  priceCents: 2000,
};

const BASE_EVENT = { status: "SCHEDULED" };

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

function makePublicTx() {
  return {
    club: {
      findUnique: vi.fn().mockResolvedValue({ id: CLUB_ID }),
    },
  };
}

function makeTenantTx(
  overrides: {
    event?: object | null;
    sector?: object | null;
    ticketCreateError?: Error;
    existingTicket?: object | null;
  } = {},
) {
  const event = overrides.event === undefined ? BASE_EVENT : overrides.event;
  const sector =
    overrides.sector === undefined ? BASE_SECTOR : overrides.sector;

  return {
    event: {
      findUnique: vi.fn().mockResolvedValue(event),
    },
    eventSector: {
      findUnique: vi.fn().mockResolvedValue(sector),
    },
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
    },
    fanProfile: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

function mockGateway(result = GATEWAY_RESULT) {
  const gateway = {
    name: "asaas",
    supportedMethods: ["PIX"] as const,
    createCharge: vi.fn().mockResolvedValue(result),
    cancelCharge: vi.fn(),
    parseWebhook: vi.fn(),
  };
  vi.spyOn(GatewayRegistry, "forMethod").mockReturnValue(gateway);
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
  GatewayRegistry._reset();
  vi.mocked(withTenantSchema).mockImplementation((_p, _c, fn) =>
    fn(makeTenantTx() as unknown as Parameters<typeof fn>[0]),
  );
  vi.mocked(isPrismaUniqueConstraintError).mockReturnValue(false);
  vi.mocked(assertEventExists).mockResolvedValue(undefined);
  vi.mocked(assertEventSectorExists).mockResolvedValue(undefined);
});

describe("purchaseTicket — happy path", () => {
  it("returns 201 response with amountCents as integer [FIN] and gatewayMeta", async () => {
    mockGateway();
    const result = await purchaseTicket(
      mockPrisma,
      CLUB_SLUG,
      EVENT_ID,
      VALID_INPUT,
    );

    expect(result.ticketId).toBe("tkt_01");
    expect(result.status).toBe("PENDING");
    expect(result.fanEmail).toBe(VALID_INPUT.fanEmail);
    expect(result.amountCents).toBe(2000);
    expect(Number.isInteger(result.amountCents)).toBe(true);
    expect(result.gatewayMeta.qrCodeBase64).toBe("abc123");
  });

  it("calls GatewayRegistry.forMethod('PIX') — never concrete gateway", async () => {
    const spy = vi.spyOn(GatewayRegistry, "forMethod").mockReturnValue({
      name: "asaas",
      supportedMethods: ["PIX"] as const,
      createCharge: vi.fn().mockResolvedValue(GATEWAY_RESULT),
      cancelCharge: vi.fn(),
      parseWebhook: vi.fn(),
    });

    await purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT);

    expect(spy).toHaveBeenCalledWith("PIX");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("passes idempotencyKey = ticket.id to gateway", async () => {
    const gateway = mockGateway();
    await purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT);

    expect(gateway.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "tkt_01" }),
    );
  });
});

describe("purchaseTicket — error paths", () => {
  it("throws NotFoundError when clubSlug is unknown", async () => {
    const badPrisma = {
      club: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as Parameters<typeof purchaseTicket>[0];

    await expect(
      purchaseTicket(badPrisma, "unknown-club", EVENT_ID, VALID_INPUT),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when event is missing (assertEventExists)", async () => {
    mockGateway();
    vi.mocked(assertEventExists).mockRejectedValueOnce(
      new NotFoundError("Evento não encontrado."),
    );

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
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

  it("throws NotFoundError when sectorId belongs to a different event (assertEventSectorExists)", async () => {
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

  it("re-throws unexpected errors from ticket.create", async () => {
    mockGateway();
    const unexpected = new Error("DB connection lost");
    vi.mocked(isPrismaUniqueConstraintError).mockReturnValue(false);
    useTenant({ ticketCreateError: unexpected });

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow("DB connection lost");
  });
});

describe("purchaseTicket — idempotency", () => {
  it("returns existing ticketId on duplicate (unique constraint hit)", async () => {
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

  it("re-throws if existing ticket lookup also fails", async () => {
    const uniqueErr = new Error("Unique constraint failed");
    vi.mocked(isPrismaUniqueConstraintError).mockReturnValue(true);
    useTenant({ ticketCreateError: uniqueErr, existingTicket: null });
    mockGateway();

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow();
  });
});

describe("purchaseTicket — gateway failure", () => {
  it("propagates gateway error (does not silently swallow)", async () => {
    vi.spyOn(GatewayRegistry, "forMethod").mockReturnValue({
      name: "asaas",
      supportedMethods: ["PIX"] as const,
      createCharge: vi.fn().mockRejectedValue(new Error("Gateway timeout")),
      cancelCharge: vi.fn(),
      parseWebhook: vi.fn(),
    });

    await expect(
      purchaseTicket(mockPrisma, CLUB_SLUG, EVENT_ID, VALID_INPUT),
    ).rejects.toThrow("Gateway timeout");
  });
});

describe("purchaseTicket — cross-tenant isolation", () => {
  it("returns NotFoundError for unknown event — never 403 — preserving tenant isolation", async () => {
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
