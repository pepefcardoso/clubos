import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { listFans } from "./fans.service.js";

const makeFan = (
  overrides: Partial<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    totalSpentCents: number;
    eventIds: string[];
    createdAt: Date;
  }> = {},
) => ({
  id: "fan-1",
  name: "João Silva",
  email: "joao@example.com",
  phone: "11999990000",
  totalSpentCents: 15000,
  eventIds: ["ev-1", "ev-2"],
  createdAt: new Date("2025-01-01"),
  ...overrides,
});

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: async (
    _prisma: unknown,
    _clubId: string,
    fn: (tx: unknown) => Promise<unknown>,
  ) => fn(_prisma),
}));

function buildTx(rows: ReturnType<typeof makeFan>[], total: number) {
  return {
    fanProfile: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaClient;
}

describe("listFans", () => {
  it("returns paginated data with eventCount derived from eventIds", async () => {
    const fan = makeFan();
    const tx = buildTx([fan], 1);
    const result = await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]!.eventCount).toBe(2);
    expect(result.data[0]!.totalSpentCents).toBe(15000);
  });

  it("passes search to OR filter", async () => {
    const tx = buildTx([], 0);
    await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
      search: "joao",
    });

    const callArgs = (tx.fanProfile.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { where: unknown };
    expect(callArgs.where).toHaveProperty("OR");
  });

  it("passes no where clause when search is absent", async () => {
    const tx = buildTx([], 0);
    await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
    });

    const callArgs = (tx.fanProfile.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { where: unknown };
    expect(callArgs.where).toEqual({});
  });

  it("applies correct skip for page 2", async () => {
    const tx = buildTx([], 0);
    await listFans(tx, "club-1", {
      page: 2,
      limit: 5,
      sortBy: "createdAt",
      order: "desc",
    });

    const callArgs = (tx.fanProfile.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { skip: number };
    expect(callArgs.skip).toBe(5);
  });

  it("sorts by totalSpentCents desc", async () => {
    const tx = buildTx([], 0);
    await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "totalSpentCents",
      order: "desc",
    });

    const callArgs = (tx.fanProfile.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { orderBy: unknown };
    expect(callArgs.orderBy).toEqual({ totalSpentCents: "desc" });
  });

  it("returns empty data and total 0 when no fans match", async () => {
    const tx = buildTx([], 0);
    const result = await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
      search: "nomatch",
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("totalSpentCents is an integer, never a float", async () => {
    const fan = makeFan({ totalSpentCents: 9999 });
    const tx = buildTx([fan], 1);
    const result = await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
    });

    expect(Number.isInteger(result.data[0]!.totalSpentCents)).toBe(true);
  });
});
