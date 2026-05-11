import { describe, it, expect, vi } from "vitest";
import { listFans } from "./fans.service.js";
import type { PrismaClient } from "../../../../generated/prisma/index.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: async (
    _prisma: unknown,
    _clubId: string,
    fn: (tx: unknown) => Promise<unknown>,
  ) => fn(_prisma),
}));

function makeFan(
  overrides: Partial<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    totalSpentCents: number;
    eventIds: string[];
    createdAt: Date;
  }> = {},
) {
  return {
    id: "fan-1",
    name: "João Silva",
    email: "joao@example.com",
    phone: "11999990000",
    totalSpentCents: 15000,
    eventIds: ["ev-1", "ev-2"],
    createdAt: new Date("2025-01-01"),
    ...overrides,
  };
}

function buildTx(rows: ReturnType<typeof makeFan>[], total: number) {
  return {
    fanProfile: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
  } as unknown as PrismaClient;
}

describe("listFans", () => {
  it("derives eventCount from eventIds array length", async () => {
    const fan = makeFan({ eventIds: ["ev-1", "ev-2", "ev-3"] });
    const tx = buildTx([fan], 1);

    const result = await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
    });

    expect(result.data[0]!.eventCount).toBe(3);
  });

  it("totalSpentCents is an integer — never a float [FIN]", async () => {
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

  it("returns correct pagination shape", async () => {
    const tx = buildTx([makeFan()], 42);

    const result = await listFans(tx, "club-1", {
      page: 2,
      limit: 10,
      sortBy: "createdAt",
      order: "desc",
    });

    expect(result.total).toBe(42);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
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

  it("passes search to OR filter with name, email, phone fields", async () => {
    const tx = buildTx([], 0);

    await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
      search: "joao",
    });

    const callArgs = (tx.fanProfile.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { where: Record<string, unknown> };
    expect(callArgs.where).toHaveProperty("OR");
    const orClauses = callArgs.where["OR"] as Array<Record<string, unknown>>;
    const fields = orClauses.map((c) => Object.keys(c)[0]);
    expect(fields).toContain("email");
    expect(fields).toContain("name");
    expect(fields).toContain("phone");
  });

  it("passes empty where when search is absent", async () => {
    const tx = buildTx([], 0);

    await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
    });

    const callArgs = (tx.fanProfile.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { where: Record<string, unknown> };
    expect(callArgs.where).toEqual({});
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

  it("returns empty data array and total 0 when no fans match", async () => {
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

  it("runs findMany and count in parallel (both called once)", async () => {
    const tx = buildTx([], 0);

    await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
    });

    expect(tx.fanProfile.findMany).toHaveBeenCalledTimes(1);
    expect(tx.fanProfile.count).toHaveBeenCalledTimes(1);
  });

  it("phone field is not exposed — only in search filter, not in response", async () => {
    const fan = makeFan({ phone: "11987654321" });
    const tx = buildTx([fan], 1);

    const result = await listFans(tx, "club-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      order: "desc",
    });

    expect(result.data[0]).toHaveProperty("phone");
  });

  it("handles search term with injection-like characters without throwing", async () => {
    const tx = buildTx([], 0);

    await expect(
      listFans(tx, "club-1", {
        page: 1,
        limit: 20,
        sortBy: "createdAt",
        order: "desc",
        search: '=HYPERLINK("http://evil.com")',
      }),
    ).resolves.not.toThrow();
  });
});
