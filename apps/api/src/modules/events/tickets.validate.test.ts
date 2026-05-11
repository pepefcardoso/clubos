import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateTicket,
  TicketAlreadyScannedError,
  InvalidQrTokenError,
  TicketNotValidForEntryError,
} from "./tickets.validate.service.js";
import { generateQrToken } from "../../lib/qr-token.js";
import { NotFoundError } from "../../lib/errors.js";
import type { Redis } from "ioredis";

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_p: unknown, _c: string, fn: (tx: unknown) => unknown) => fn(makeTx()),
  ),
}));

vi.mock("../../lib/assert-tenant-ownership.js", () => ({
  assertEventExists: vi.fn().mockResolvedValue(undefined),
  assertTicketExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/sse-bus.js", () => ({
  emitCheckinConfirmed: vi.fn(),
}));

vi.mock("../../jobs/queues.js", () => ({
  fanFunnelQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { withTenantSchema } from "../../lib/prisma.js";
import {
  assertEventExists,
  assertTicketExists,
} from "../../lib/assert-tenant-ownership.js";

const CLUB_ID = "clubabc123456789012345";
const EVENT_ID = "evt_01";
const TICKET_ID = "tkt_01";
const ACTOR_ID = "user-admin-1";

const VALID_QR_TOKEN = generateQrToken(TICKET_ID, EVENT_ID);
const VALID_PAYLOAD = JSON.stringify({
  ticketId: TICKET_ID,
  eventId: EVENT_ID,
  clubId: CLUB_ID,
  t: VALID_QR_TOKEN,
});

const BASE_TICKET = {
  id: TICKET_ID,
  eventId: EVENT_ID,
  status: "PAID",
  checkedIn: false,
  fanName: "João Silva",
  sector: { name: "Arquibancada" },
};

function makeTx(ticketOverride?: Partial<typeof BASE_TICKET> | null) {
  const ticket =
    ticketOverride === null ? null : { ...BASE_TICKET, ...ticketOverride };

  return {
    ticket: {
      findUnique: vi.fn().mockResolvedValue(ticket),
      update: vi.fn().mockResolvedValue({}),
    },
    fieldAccessLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeRedis(setResult: string | null = "OK"): Redis {
  return {
    set: vi.fn().mockResolvedValue(setResult),
    get: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis;
}

const mockPrisma = {} as Parameters<typeof validateTicket>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withTenantSchema).mockImplementation((_p, _c, fn) =>
    fn(makeTx() as unknown as Parameters<typeof fn>[0]),
  );
  vi.mocked(assertEventExists).mockResolvedValue(undefined);
  vi.mocked(assertTicketExists).mockResolvedValue(undefined);
});

describe("validateTicket — QR payload parsing", () => {
  it("throws InvalidQrTokenError for malformed JSON", async () => {
    const redis = makeRedis();
    await expect(
      validateTicket(
        mockPrisma,
        redis,
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        "not-json",
      ),
    ).rejects.toBeInstanceOf(InvalidQrTokenError);
  });

  it("throws InvalidQrTokenError for JSON missing required fields", async () => {
    const redis = makeRedis();
    await expect(
      validateTicket(
        mockPrisma,
        redis,
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        JSON.stringify({ ticketId: TICKET_ID }),
      ),
    ).rejects.toBeInstanceOf(InvalidQrTokenError);
  });

  it("throws InvalidQrTokenError when eventId in payload doesn't match route eventId", async () => {
    const redis = makeRedis();
    const payload = JSON.stringify({
      ticketId: TICKET_ID,
      eventId: "other-event",
      clubId: CLUB_ID,
      t: VALID_QR_TOKEN,
    });

    await expect(
      validateTicket(
        mockPrisma,
        redis,
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        payload,
      ),
    ).rejects.toBeInstanceOf(InvalidQrTokenError);
  });

  it("throws InvalidQrTokenError when clubId in payload doesn't match route clubId [SEC-TEN]", async () => {
    const redis = makeRedis();
    const payload = JSON.stringify({
      ticketId: TICKET_ID,
      eventId: EVENT_ID,
      clubId: "different-club-id",
      t: VALID_QR_TOKEN,
    });

    await expect(
      validateTicket(
        mockPrisma,
        redis,
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        payload,
      ),
    ).rejects.toBeInstanceOf(InvalidQrTokenError);
  });
});

describe("validateTicket — HMAC validation [SEC-WH]", () => {
  it("throws InvalidQrTokenError for tampered HMAC token", async () => {
    const redis = makeRedis();
    const payload = JSON.stringify({
      ticketId: TICKET_ID,
      eventId: EVENT_ID,
      clubId: CLUB_ID,
      t: "tampered.invalid.token",
    });

    await expect(
      validateTicket(
        mockPrisma,
        redis,
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        payload,
      ),
    ).rejects.toBeInstanceOf(InvalidQrTokenError);

    expect(redis.set).not.toHaveBeenCalled();
  });

  it("logs invalid HMAC attempt to fieldAccessLog", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    const redis = makeRedis();
    const payload = JSON.stringify({
      ticketId: TICKET_ID,
      eventId: EVENT_ID,
      clubId: CLUB_ID,
      t: "tampered",
    });

    await validateTicket(
      mockPrisma,
      redis,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      "127.0.0.1",
      "TestAgent",
      payload,
    ).catch(() => {});

    expect(tx.fieldAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isValid: false,
          rejectionReason: "invalid_hmac",
        }),
      }),
    );
  });
});

describe("validateTicket — Redis dedup [SEC-WH]", () => {
  it("returns 409 TicketAlreadyScannedError when Redis SET NX returns null", async () => {
    const redis = makeRedis(null);

    await expect(
      validateTicket(
        mockPrisma,
        redis,
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        VALID_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(TicketAlreadyScannedError);
  });

  it("calls Redis SET with NX and EX 86400 (24h TTL)", async () => {
    const redis = makeRedis("OK");
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(makeTx() as unknown as Parameters<typeof fn>[0]),
    );

    await validateTicket(
      mockPrisma,
      redis,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      undefined,
      undefined,
      VALID_PAYLOAD,
    ).catch(() => {});

    expect(redis.set).toHaveBeenCalledWith(
      `ticket:scan:${TICKET_ID}`,
      ACTOR_ID,
      "EX",
      86400,
      "NX",
    );
  });
});

describe("validateTicket — business rules", () => {
  it("throws TicketNotValidForEntryError for PENDING ticket (payment not confirmed)", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(makeTx({ status: "PENDING" }) as unknown as Parameters<typeof fn>[0]),
    );

    await expect(
      validateTicket(
        mockPrisma,
        makeRedis(),
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        VALID_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(TicketNotValidForEntryError);
  });

  it("throws TicketNotValidForEntryError for CANCELLED ticket", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(
        makeTx({ status: "CANCELLED" }) as unknown as Parameters<typeof fn>[0],
      ),
    );

    await expect(
      validateTicket(
        mockPrisma,
        makeRedis(),
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        VALID_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(TicketNotValidForEntryError);
  });

  it("throws TicketAlreadyScannedError for already checked-in ticket (DB-level guard)", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(makeTx({ checkedIn: true }) as unknown as Parameters<typeof fn>[0]),
    );

    await expect(
      validateTicket(
        mockPrisma,
        makeRedis(),
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        VALID_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(TicketAlreadyScannedError);
  });

  it("throws NotFoundError when ticket eventId doesn't match route eventId [SEC-OBJ]", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(
        makeTx({ eventId: "different-event" }) as unknown as Parameters<
          typeof fn
        >[0],
      ),
    );

    await expect(
      validateTicket(
        mockPrisma,
        makeRedis(),
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        VALID_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError when assertTicketExists rejects — cross-tenant [SEC-TEN]", async () => {
    vi.mocked(assertTicketExists).mockRejectedValueOnce(
      new NotFoundError("Ingresso não encontrado."),
    );

    await expect(
      validateTicket(
        mockPrisma,
        makeRedis(),
        CLUB_ID,
        EVENT_ID,
        ACTOR_ID,
        undefined,
        undefined,
        VALID_PAYLOAD,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("validateTicket — happy path", () => {
  it("returns result with fanName, sectorName, checkedInAt", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(makeTx() as unknown as Parameters<typeof fn>[0]),
    );

    const result = await validateTicket(
      mockPrisma,
      makeRedis(),
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      "127.0.0.1",
      "TestAgent/1.0",
      VALID_PAYLOAD,
    );

    expect(result.ticketId).toBe(TICKET_ID);
    expect(result.fanName).toBe("João Silva");
    expect(result.sectorName).toBe("Arquibancada");
    expect(result.checkedInAt).toBeDefined();
  });

  it("enqueues fanFunnelQueue job after successful check-in", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(makeTx() as unknown as Parameters<typeof fn>[0]),
    );

    const { fanFunnelQueue } = await import("../../jobs/queues.js");

    await validateTicket(
      mockPrisma,
      makeRedis(),
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
      undefined,
      undefined,
      VALID_PAYLOAD,
    );

    expect(fanFunnelQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        ticketId: TICKET_ID,
        eventId: EVENT_ID,
        clubId: CLUB_ID,
      }),
      expect.objectContaining({ jobId: `fan-funnel:${TICKET_ID}` }),
    );
  });
});
