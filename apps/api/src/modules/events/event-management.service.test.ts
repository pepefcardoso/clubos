import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  cancelEvent,
  assertEventBelongsToClub,
  EventNotFoundError,
  EventAlreadyCancelledError,
} from "./event-management.service.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) =>
      fn(makeTx()),
  ),
}));

import { withTenantSchema } from "./../../lib/prisma.js";

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
  eventDate: new Date("2025-08-10T18:00:00Z"),
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
  it("returns event with sectors", async () => {
    const result = await createEvent(mockPrisma, CLUB_ID, {
      opponent: "Flamengo",
      eventDate: "2025-08-10T18:00:00Z",
      venue: "Estádio Municipal",
      sectors: [{ name: "Arquibancada", capacity: 200, priceCents: 2000 }],
    });

    expect(result).toMatchObject({
      id: EVENT_ID,
      opponent: "Flamengo",
      status: "SCHEDULED",
      sectors: [expect.objectContaining({ priceCents: 2000 })],
    });
  });
});

describe("listEvents", () => {
  it("returns paginated result", async () => {
    const result = await listEvents(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
  });
});

describe("getEventById", () => {
  it("returns event when found", async () => {
    const result = await getEventById(mockPrisma, CLUB_ID, EVENT_ID);
    expect(result.id).toBe(EVENT_ID);
  });

  it("throws EventNotFoundError when absent", async () => {
    useTx(null);
    await expect(getEventById(mockPrisma, CLUB_ID, "ghost")).rejects.toThrow(
      EventNotFoundError,
    );
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

  it("throws EventNotFoundError — returns 404 never 403", async () => {
    const tx = makeTx(null);
    await expect(
      assertEventBelongsToClub(
        tx as unknown as Parameters<typeof createEvent>[0],
        "ghost",
      ),
    ).rejects.toThrow(EventNotFoundError);
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

  it("throws EventNotFoundError when absent", async () => {
    useTx(null);
    await expect(
      updateEvent(mockPrisma, CLUB_ID, "ghost", { opponent: "Santos" }),
    ).rejects.toThrow(EventNotFoundError);
  });
});

describe("cancelEvent", () => {
  it("soft-deletes via status = CANCELLED", async () => {
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
});
