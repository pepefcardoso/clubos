import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  cancelEvent,
  uploadEventSponsorLogo,
  assertEventBelongsToClub,
  EventNotFoundError,
  EventAlreadyCancelledError,
  InvalidSponsorLogoError,
} from "./event-management.service.js";

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_p: unknown, _c: string, fn: (tx: unknown) => unknown) => fn(makeTx()),
  ),
}));

vi.mock("../../lib/storage.js", () => ({
  saveFile: vi.fn().mockResolvedValue("https://cdn.clubos.com.br/logo.webp"),
}));

vi.mock("../../lib/file-validation.js", () => ({
  validateImageMagicBytes: vi.fn().mockResolvedValue(undefined),
  InvalidMagicBytesError: class InvalidMagicBytesError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "InvalidMagicBytesError";
    }
  },
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 400, height: 100 }),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("fake-webp")),
  })),
}));

vi.mock("../../lib/assert-tenant-ownership.js", () => ({
  assertEventExists: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../jobs/queues.js", () => ({
  gameLogisticsNoticeQueue: {
    add: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("./checklist/checklist.service.js", () => ({
  seedChecklistItems: vi.fn().mockResolvedValue(undefined),
}));

import { withTenantSchema } from "../../lib/prisma.js";

const CLUB_ID = "clubabc123456789012345";
const EVENT_ID = "evt_01";

const BASE_SECTOR = {
  id: "sec_01",
  eventId: EVENT_ID,
  name: "Arquibancada",
  capacity: 200,
  sold: 0,
  priceCents: 2000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BASE_EVENT = {
  id: EVENT_ID,
  opponent: "Flamengo",
  eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
  venue: "Estádio Municipal",
  description: null,
  sponsorName: null,
  sponsorLogoUrl: null,
  sponsorCtaUrl: null,
  status: "SCHEDULED" as string,
  createdAt: new Date(),
  updatedAt: new Date(),
  sectors: [BASE_SECTOR],
};

function makeTx(eventOverride?: typeof BASE_EVENT | null) {
  const resolved =
    eventOverride === null ? null : (eventOverride ?? BASE_EVENT);
  return {
    event: {
      create: vi.fn().mockResolvedValue(BASE_EVENT),
      findMany: vi.fn().mockResolvedValue([BASE_EVENT]),
      findUnique: vi.fn().mockResolvedValue(resolved),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockResolvedValue(BASE_EVENT),
    },
  };
}

const mockPrisma = {} as Parameters<typeof createEvent>[0];

function useTx(override?: typeof BASE_EVENT | null) {
  vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
    fn(makeTx(override) as unknown as Parameters<typeof fn>[0]),
  );
}

beforeEach(() => {
  vi.mocked(withTenantSchema).mockImplementation((_p, _c, fn) =>
    fn(makeTx() as unknown as Parameters<typeof fn>[0]),
  );
});

describe("createEvent", () => {
  it("returns EventResponse with sectors and SCHEDULED status", async () => {
    const result = await createEvent(mockPrisma, CLUB_ID, {
      opponent: "Flamengo",
      eventDate: BASE_EVENT.eventDate.toISOString(),
      venue: "Estádio Municipal",
      sectors: [{ name: "Arquibancada", capacity: 200, priceCents: 2000 }],
    });

    expect(result.id).toBe(EVENT_ID);
    expect(result.status).toBe("SCHEDULED");
    expect(result.sectors).toHaveLength(1);
    expect(result.sectors[0]!.priceCents).toBe(2000);
  });

  it("sector priceCents is an integer [FIN]", async () => {
    const result = await createEvent(mockPrisma, CLUB_ID, {
      opponent: "Santos",
      eventDate: BASE_EVENT.eventDate.toISOString(),
      venue: "Vila Belmiro",
      sectors: [{ name: "Geral", capacity: 100, priceCents: 5000 }],
    });

    expect(Number.isInteger(result.sectors[0]!.priceCents)).toBe(true);
  });

  it("enqueues game-logistics-notice job when event is in the future", async () => {
    const { gameLogisticsNoticeQueue } = await import("../../jobs/queues.js");
    await createEvent(mockPrisma, CLUB_ID, {
      opponent: "Vasco",
      eventDate: new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString(),
      venue: "Maracanã",
      sectors: [{ name: "Norte", capacity: 500, priceCents: 3000 }],
    });

    expect(gameLogisticsNoticeQueue.add).toHaveBeenCalledOnce();
  });

  it("does NOT enqueue logistics job for past eventDate", async () => {
    const { gameLogisticsNoticeQueue } = await import("../../jobs/queues.js");
    vi.mocked(gameLogisticsNoticeQueue.add).mockClear();

    const pastDate = new Date(Date.now() - 60_000).toISOString();
    await createEvent(mockPrisma, CLUB_ID, {
      opponent: "Botafogo",
      eventDate: pastDate,
      venue: "Nilton Santos",
      sectors: [{ name: "Sul", capacity: 100, priceCents: 1000 }],
    });

    expect(gameLogisticsNoticeQueue.add).not.toHaveBeenCalled();
  });

  it("calls seedChecklistItems with the created event id", async () => {
    const { seedChecklistItems } =
      await import("./checklist/checklist.service.js");
    await createEvent(mockPrisma, CLUB_ID, {
      opponent: "Palmeiras",
      eventDate: BASE_EVENT.eventDate.toISOString(),
      venue: "Allianz Parque",
      sectors: [{ name: "Leste", capacity: 300, priceCents: 4000 }],
    });

    expect(seedChecklistItems).toHaveBeenCalledWith(
      expect.anything(),
      EVENT_ID,
    );
  });
});

describe("listEvents", () => {
  it("returns paginated result with correct shape", async () => {
    const result = await listEvents(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe(EVENT_ID);
  });

  it("applies skip correctly for page 2", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await listEvents(mockPrisma, CLUB_ID, { page: 2, limit: 10 });

    const call = vi.mocked(tx.event.findMany).mock.calls[0]![0] as {
      skip: number;
    };
    expect(call.skip).toBe(10);
  });

  it("filters by status when provided", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await listEvents(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
      status: "SCHEDULED",
    });

    const call = vi.mocked(tx.event.findMany).mock.calls[0]![0] as {
      where: { status: string };
    };
    expect(call.where.status).toBe("SCHEDULED");
  });

  it("does not include status filter when omitted", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await listEvents(mockPrisma, CLUB_ID, { page: 1, limit: 20 });

    const call = vi.mocked(tx.event.findMany).mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).not.toHaveProperty("status");
  });
});

describe("getEventById", () => {
  it("returns event when found", async () => {
    const result = await getEventById(mockPrisma, CLUB_ID, EVENT_ID);
    expect(result.id).toBe(EVENT_ID);
    expect(result.opponent).toBe("Flamengo");
  });

  it("throws EventNotFoundError when absent", async () => {
    useTx(null);
    await expect(getEventById(mockPrisma, CLUB_ID, "ghost")).rejects.toThrow(
      EventNotFoundError,
    );
  });
});

describe("updateEvent", () => {
  it("passes only provided fields to prisma update", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await updateEvent(mockPrisma, CLUB_ID, EVENT_ID, { opponent: "Santos" });

    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { opponent: "Santos" } }),
    );
  });

  it("throws EventNotFoundError when event is absent", async () => {
    useTx(null);
    await expect(
      updateEvent(mockPrisma, CLUB_ID, "ghost", { opponent: "Santos" }),
    ).rejects.toThrow(EventNotFoundError);
  });

  it("rescheduled logistics job when eventDate changes", async () => {
    const { gameLogisticsNoticeQueue } = await import("../../jobs/queues.js");
    const removeMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(gameLogisticsNoticeQueue.getJob).mockResolvedValueOnce({
      remove: removeMock,
    } as never);

    await updateEvent(mockPrisma, CLUB_ID, EVENT_ID, {
      eventDate: new Date(Date.now() + 96 * 60 * 60 * 1_000).toISOString(),
    });

    expect(removeMock).toHaveBeenCalled();
    expect(gameLogisticsNoticeQueue.add).toHaveBeenCalled();
  });
});

describe("cancelEvent", () => {
  it("soft-cancels via status = CANCELLED", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await cancelEvent(mockPrisma, CLUB_ID, EVENT_ID);

    expect(tx.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED" } }),
    );
  });

  it("throws EventAlreadyCancelledError when already cancelled", async () => {
    useTx({ ...BASE_EVENT, status: "CANCELLED" });
    await expect(cancelEvent(mockPrisma, CLUB_ID, EVENT_ID)).rejects.toThrow(
      EventAlreadyCancelledError,
    );
  });

  it("throws EventNotFoundError when absent", async () => {
    useTx(null);
    await expect(cancelEvent(mockPrisma, CLUB_ID, "ghost")).rejects.toThrow(
      EventNotFoundError,
    );
  });

  it("removes pending logistics job on cancel", async () => {
    const { gameLogisticsNoticeQueue } = await import("../../jobs/queues.js");
    const removeMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(gameLogisticsNoticeQueue.getJob).mockResolvedValueOnce({
      remove: removeMock,
    } as never);

    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await cancelEvent(mockPrisma, CLUB_ID, EVENT_ID);
    expect(removeMock).toHaveBeenCalled();
  });
});

describe("assertEventBelongsToClub", () => {
  it("resolves when event exists", async () => {
    const tx = makeTx();
    await expect(
      assertEventBelongsToClub(
        tx as unknown as Parameters<typeof createEvent>[0],
        EVENT_ID,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws EventNotFoundError — returns 404 never 403 [SEC-OBJ]", async () => {
    const tx = makeTx(null);
    await expect(
      assertEventBelongsToClub(
        tx as unknown as Parameters<typeof createEvent>[0],
        "foreign-event-id",
      ),
    ).rejects.toThrow(EventNotFoundError);
  });
});

describe("uploadEventSponsorLogo", () => {
  const validBuffer = Buffer.alloc(1024);

  it("returns sponsorLogoUrl on success", async () => {
    const result = await uploadEventSponsorLogo(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      "image/png",
      validBuffer,
    );
    expect(result.sponsorLogoUrl).toBe("https://cdn.clubos.com.br/logo.webp");
  });

  it("throws InvalidSponsorLogoError when file exceeds 5MB", async () => {
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024);
    await expect(
      uploadEventSponsorLogo(
        mockPrisma,
        CLUB_ID,
        EVENT_ID,
        "image/png",
        bigBuffer,
      ),
    ).rejects.toThrow(InvalidSponsorLogoError);
  });

  it("throws InvalidSponsorLogoError for disallowed MIME type", async () => {
    await expect(
      uploadEventSponsorLogo(
        mockPrisma,
        CLUB_ID,
        EVENT_ID,
        "application/pdf",
        validBuffer,
      ),
    ).rejects.toThrow(InvalidSponsorLogoError);
  });

  it("throws InvalidSponsorLogoError when image dimensions are too small", async () => {
    const sharp = (await import("sharp")).default;
    vi.mocked(sharp).mockReturnValueOnce({
      metadata: vi.fn().mockResolvedValue({ width: 50, height: 20 }),
      webp: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from("x")),
    } as never);

    await expect(
      uploadEventSponsorLogo(
        mockPrisma,
        CLUB_ID,
        EVENT_ID,
        "image/png",
        validBuffer,
      ),
    ).rejects.toThrow(InvalidSponsorLogoError);
  });
});
