import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listChecklist,
  toggleChecklistItem,
  seedChecklistItems,
} from "./checklist.service.js";
import { DEFAULT_CHECKLIST_ITEMS } from "./checklist.schema.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) =>
      fn(makeTx()),
  ),
}));

vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertEventExists: vi.fn().mockResolvedValue(undefined),
}));

import { withTenantSchema } from "../../../lib/prisma.js";
import { assertEventExists } from "../../../lib/assert-tenant-ownership.js";
import { NotFoundError } from "../../../lib/errors.js";

const CLUB_ID = "clubabc123456789012345";
const EVENT_ID = "evt_01";
const ITEM_ID = "item_01";
const ACTOR_ID = "user_01";

const BASE_ITEM = {
  id: ITEM_ID,
  eventId: EVENT_ID,
  category: "EQUIPAMENTOS",
  item: "Uniformes titulares conferidos",
  completed: false,
  completedBy: null as string | null,
  completedAt: null as Date | null,
  createdAt: new Date("2025-08-01T00:00:00Z"),
  updatedAt: new Date("2025-08-01T00:00:00Z"),
};

function makeTx(itemOverride?: typeof BASE_ITEM | null) {
  const resolved = itemOverride === null ? null : (itemOverride ?? BASE_ITEM);
  return {
    gameChecklist: {
      findMany: vi.fn().mockResolvedValue([BASE_ITEM]),
      findFirst: vi.fn().mockResolvedValue(resolved),
      update: vi.fn().mockResolvedValue({ ...BASE_ITEM, ...itemOverride }),
      createMany: vi
        .fn()
        .mockResolvedValue({ count: DEFAULT_CHECKLIST_ITEMS.length }),
    },
  };
}

const mockPrisma = {} as Parameters<typeof listChecklist>[0];

function useTx(itemOverride?: typeof BASE_ITEM | null) {
  vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
    fn(makeTx(itemOverride) as unknown as Parameters<typeof fn>[0]),
  );
}

beforeEach(() => {
  vi.mocked(withTenantSchema).mockImplementation((_p, _c, fn) =>
    fn(makeTx() as unknown as Parameters<typeof fn>[0]),
  );
  vi.mocked(assertEventExists).mockResolvedValue(undefined);
});

describe("seedChecklistItems", () => {
  it("calls createMany with DEFAULT_CHECKLIST_ITEMS.length rows", async () => {
    const tx = makeTx();
    await seedChecklistItems(
      tx as unknown as Parameters<typeof listChecklist>[0],
      EVENT_ID,
    );
    expect(tx.gameChecklist.createMany).toHaveBeenCalledOnce();
    const { data } = vi.mocked(tx.gameChecklist.createMany).mock
      .calls[0]![0] as {
      data: unknown[];
    };
    expect(data).toHaveLength(DEFAULT_CHECKLIST_ITEMS.length);
  });

  it("each row carries the supplied eventId", async () => {
    const tx = makeTx();
    await seedChecklistItems(
      tx as unknown as Parameters<typeof listChecklist>[0],
      EVENT_ID,
    );
    const { data } = vi.mocked(tx.gameChecklist.createMany).mock
      .calls[0]![0] as {
      data: Array<{ eventId: string }>;
    };
    expect(data.every((r) => r.eventId === EVENT_ID)).toBe(true);
  });
});

describe("listChecklist", () => {
  it("returns grouped response with correct counts", async () => {
    const result = await listChecklist(mockPrisma, CLUB_ID, EVENT_ID);

    expect(result.eventId).toBe(EVENT_ID);
    expect(result.totalItems).toBe(1);
    expect(result.completedItems).toBe(0);
    expect(result.byCategory["EQUIPAMENTOS"]).toHaveLength(1);
  });

  it("throws NotFoundError when event does not exist", async () => {
    vi.mocked(assertEventExists).mockRejectedValueOnce(
      new NotFoundError("Evento não encontrado."),
    );
    await expect(listChecklist(mockPrisma, CLUB_ID, "ghost")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns empty byCategory when no items exist", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) => {
      const tx = {
        ...makeTx(),
        gameChecklist: {
          ...makeTx().gameChecklist,
          findMany: vi.fn().mockResolvedValue([]),
        },
      };
      return fn(tx as unknown as Parameters<typeof fn>[0]);
    });

    const result = await listChecklist(mockPrisma, CLUB_ID, EVENT_ID);
    expect(result.totalItems).toBe(0);
    expect(Object.keys(result.byCategory)).toHaveLength(0);
  });

  it("counts completedItems correctly", async () => {
    const completedItem = { ...BASE_ITEM, completed: true };
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) => {
      const tx = {
        ...makeTx(),
        gameChecklist: {
          ...makeTx().gameChecklist,
          findMany: vi.fn().mockResolvedValue([BASE_ITEM, completedItem]),
        },
      };
      return fn(tx as unknown as Parameters<typeof fn>[0]);
    });

    const result = await listChecklist(mockPrisma, CLUB_ID, EVENT_ID);
    expect(result.totalItems).toBe(2);
    expect(result.completedItems).toBe(1);
  });
});

describe("toggleChecklistItem", () => {
  it("sets completed=true with completedBy and completedAt", async () => {
    const tx = makeTx({
      ...BASE_ITEM,
      completed: true,
      completedBy: ACTOR_ID,
      completedAt: new Date(),
    });
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    const result = await toggleChecklistItem(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ITEM_ID,
      { completed: true },
      ACTOR_ID,
    );

    expect(result.completed).toBe(true);
    expect(result.completedBy).toBe(ACTOR_ID);
    expect(result.completedAt).not.toBeNull();
  });

  it("clears completedBy and completedAt when completed=false", async () => {
    const tx = makeTx({
      ...BASE_ITEM,
      completed: false,
      completedBy: null,
      completedAt: null,
    });
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    const result = await toggleChecklistItem(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ITEM_ID,
      { completed: false },
      ACTOR_ID,
    );

    expect(result.completed).toBe(false);
    expect(result.completedBy).toBeNull();
    expect(result.completedAt).toBeNull();
  });

  it("throws NotFoundError when itemId does not belong to eventId", async () => {
    useTx(null);
    await expect(
      toggleChecklistItem(
        mockPrisma,
        CLUB_ID,
        EVENT_ID,
        "wrong-item",
        { completed: true },
        ACTOR_ID,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when event does not exist", async () => {
    vi.mocked(assertEventExists).mockRejectedValueOnce(
      new NotFoundError("Evento não encontrado."),
    );
    await expect(
      toggleChecklistItem(
        mockPrisma,
        CLUB_ID,
        "ghost",
        ITEM_ID,
        { completed: true },
        ACTOR_ID,
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("passes only completed fields to prisma.update", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await toggleChecklistItem(
      mockPrisma,
      CLUB_ID,
      EVENT_ID,
      ITEM_ID,
      { completed: true },
      ACTOR_ID,
    );

    const updateCall = vi.mocked(tx.gameChecklist.update).mock.calls[0]![0];
    expect(updateCall.data.completedBy).toBe(ACTOR_ID);
    expect(updateCall.data.completed).toBe(true);
    expect(updateCall.where).toEqual({ id: ITEM_ID });
  });
});
