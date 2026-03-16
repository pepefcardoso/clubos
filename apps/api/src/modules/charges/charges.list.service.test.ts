import { describe, it, expect, vi, beforeEach } from "vitest";
import { listCharges } from "./charges.list.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

const mockFindMany = vi.fn();
const mockCount = vi.fn();

const mockTx = {
  charge: {
    findMany: mockFindMany,
    count: mockCount,
  },
} as unknown as PrismaClient;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    <T>(
      _prisma: unknown,
      _clubId: string,
      fn: (tx: PrismaClient) => Promise<T>,
    ) => fn(mockTx),
  ),
}));

const mockPrisma = {} as PrismaClient;
const CLUB_ID = "club_test_001";

function makeCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: "chg_001",
    memberId: "mem_001",
    member: { id: "mem_001", name: "João Silva" },
    amountCents: 9900,
    dueDate: new Date("2025-03-31T23:59:59.999Z"),
    status: "PENDING",
    method: "PIX",
    gatewayName: "asaas",
    externalId: "ext_001",
    gatewayMeta: { qrCodeBase64: "abc123", pixCopyPaste: "00020126" },
    retryCount: 0,
    createdAt: new Date("2025-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("listCharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated results with correct shape", async () => {
    const charge = makeCharge();
    mockFindMany.mockResolvedValue([charge]);
    mockCount.mockResolvedValue(1);

    const result = await listCharges(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "chg_001",
      memberId: "mem_001",
      memberName: "João Silva",
      amountCents: 9900,
      status: "PENDING",
      method: "PIX",
      gatewayName: "asaas",
    });
  });

  it("applies correct skip based on page and limit", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, { page: 3, limit: 10 });

    const callArgs = mockFindMany.mock.calls[0]![0] as {
      skip: number;
      take: number;
    };
    expect(callArgs.skip).toBe(20);
    expect(callArgs.take).toBe(10);
  });

  it("filters by calendar month boundaries when month param is provided", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
      month: "2025-03",
    });

    const callArgs = mockFindMany.mock.calls[0]![0] as {
      where: { dueDate: { gte: Date; lte: Date } };
    };
    expect(callArgs.where.dueDate.gte).toEqual(new Date(Date.UTC(2025, 2, 1)));
    expect(callArgs.where.dueDate.lte).toEqual(
      new Date(Date.UTC(2025, 3, 0, 23, 59, 59, 999)),
    );
  });

  it("does not include dueDate filter when month param is omitted", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, { page: 1, limit: 20 });

    const callArgs = mockFindMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where).not.toHaveProperty("dueDate");
  });

  it("applies status filter when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
      status: "OVERDUE",
    });

    const callArgs = mockFindMany.mock.calls[0]![0] as {
      where: { status: string };
    };
    expect(callArgs.where.status).toBe("OVERDUE");
  });

  it("does not include status filter when status is omitted", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, { page: 1, limit: 20 });

    const callArgs = mockFindMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where).not.toHaveProperty("status");
  });

  it("applies memberId filter when provided", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
      memberId: "mem_007",
    });

    const callArgs = mockFindMany.mock.calls[0]![0] as {
      where: { memberId: string };
    };
    expect(callArgs.where.memberId).toBe("mem_007");
  });

  it("returns empty data array when no charges match", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    const result = await listCharges(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("maps gatewayMeta to Record<string,unknown> | null correctly", async () => {
    const chargeWithNullMeta = makeCharge({ gatewayMeta: null });
    mockFindMany.mockResolvedValue([chargeWithNullMeta]);
    mockCount.mockResolvedValue(1);

    const result = await listCharges(mockPrisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data[0]!.gatewayMeta).toBeNull();
  });

  it("orders results by dueDate desc", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, { page: 1, limit: 20 });

    const callArgs = mockFindMany.mock.calls[0]![0] as {
      orderBy: { dueDate: string };
    };
    expect(callArgs.orderBy).toEqual({ dueDate: "desc" });
  });

  it("runs findMany and count in parallel (both called once)", async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await listCharges(mockPrisma, CLUB_ID, { page: 1, limit: 20 });

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockCount).toHaveBeenCalledTimes(1);
  });
});
