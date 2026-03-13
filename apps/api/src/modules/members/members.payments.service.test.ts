import { describe, it, expect, vi, beforeEach } from "vitest";
import * as prismaLib from "../../lib/prisma.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  getMemberPaymentHistory,
  findMemberInClub,
} from "./members.payments.service.js";

const CLUB_ID = "clubabc12345678901234";
const MEMBER_ID = "mbr0000000000000000001";
const MOCK_PRISMA = {} as PrismaClient;

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay001",
    chargeId: "chg001",
    paidAt: new Date("2025-03-01T10:43:00.000Z"),
    method: "PIX",
    amountCents: 9900,
    gatewayTxid: "txid001",
    cancelledAt: null,
    cancelReason: null,
    charge: {
      id: "chg001",
      dueDate: new Date("2025-03-05T00:00:00.000Z"),
      status: "PAID",
      method: "PIX",
      amountCents: 9900,
      gatewayName: "asaas",
      createdAt: new Date("2025-03-01T08:00:00.000Z"),
    },
    ...overrides,
  };
}

function mockWithTenantSchema(tx: unknown) {
  vi.spyOn(prismaLib, "withTenantSchema").mockImplementation(
    async (_p, _c, fn) => fn(tx as unknown as PrismaClient),
  );
}

describe("getMemberPaymentHistory()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns correctly shaped result for a member with one payment", async () => {
    const payment = makePayment();
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([payment]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await getMemberPaymentHistory(
      MOCK_PRISMA,
      CLUB_ID,
      MEMBER_ID,
      1,
      20,
    );

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20 });

    const item = result.data[0]!;
    expect(item.paymentId).toBe("pay001");
    expect(item.chargeId).toBe("chg001");
    expect(item.method).toBe("PIX");
    expect(item.amountCents).toBe(9900);
    expect(item.gatewayTxid).toBe("txid001");
    expect(item.cancelledAt).toBeNull();
    expect(item.cancelReason).toBeNull();
    expect(item.charge.id).toBe("chg001");
    expect(item.charge.status).toBe("PAID");
    expect(item.charge.gatewayName).toBe("asaas");
  });

  it("returns empty data array when member has no payments", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await getMemberPaymentHistory(
      MOCK_PRISMA,
      CLUB_ID,
      MEMBER_ID,
      1,
      20,
    );

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it("reflects page and limit in meta even when data is empty", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await getMemberPaymentHistory(
      MOCK_PRISMA,
      CLUB_ID,
      MEMBER_ID,
      3,
      5,
    );

    expect(result.meta.page).toBe(3);
    expect(result.meta.limit).toBe(5);
  });

  it("applies correct skip and take for page=2, limit=5", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([makePayment()]),
        count: vi.fn().mockResolvedValue(8),
      },
    };
    mockWithTenantSchema(fakeTx);

    await getMemberPaymentHistory(MOCK_PRISMA, CLUB_ID, MEMBER_ID, 2, 5);

    expect(fakeTx.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
  });

  it("orders payments by paidAt descending", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([makePayment()]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    mockWithTenantSchema(fakeTx);

    await getMemberPaymentHistory(MOCK_PRISMA, CLUB_ID, MEMBER_ID, 1, 20);

    expect(fakeTx.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { paidAt: "desc" } }),
    );
  });

  it("includes cancelled payments (cancelledAt non-null)", async () => {
    const cancelledPayment = makePayment({
      id: "pay002",
      cancelledAt: new Date("2025-03-10T09:00:00.000Z"),
      cancelReason: "Duplicate payment",
    });
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([cancelledPayment]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await getMemberPaymentHistory(
      MOCK_PRISMA,
      CLUB_ID,
      MEMBER_ID,
      1,
      20,
    );

    expect(result.data[0]!.cancelledAt).toBeInstanceOf(Date);
    expect(result.data[0]!.cancelReason).toBe("Duplicate payment");
  });

  it("serialises null gatewayName correctly when charge is CASH", async () => {
    const cashPayment = makePayment({
      charge: {
        id: "chg002",
        dueDate: new Date("2025-03-05T00:00:00.000Z"),
        status: "PAID",
        method: "CASH",
        amountCents: 9900,
        gatewayName: null,
        createdAt: new Date("2025-03-01T08:00:00.000Z"),
      },
    });
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([cashPayment]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await getMemberPaymentHistory(
      MOCK_PRISMA,
      CLUB_ID,
      MEMBER_ID,
      1,
      20,
    );

    expect(result.data[0]!.charge.gatewayName).toBeNull();
  });

  it("returns total from count query, not data length", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([makePayment()]),
        count: vi.fn().mockResolvedValue(42),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await getMemberPaymentHistory(
      MOCK_PRISMA,
      CLUB_ID,
      MEMBER_ID,
      1,
      20,
    );

    expect(result.meta.total).toBe(42);
    expect(result.data).toHaveLength(1);
  });

  it("runs findMany and count concurrently via Promise.all", async () => {
    const order: string[] = [];
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockImplementation(async () => {
          order.push("findMany");
          return [makePayment()];
        }),
        count: vi.fn().mockImplementation(async () => {
          order.push("count");
          return 1;
        }),
      },
    };
    mockWithTenantSchema(fakeTx);

    await getMemberPaymentHistory(MOCK_PRISMA, CLUB_ID, MEMBER_ID, 1, 20);

    expect(order).toContain("findMany");
    expect(order).toContain("count");
    expect(fakeTx.payment.findMany).toHaveBeenCalledOnce();
    expect(fakeTx.payment.count).toHaveBeenCalledOnce();
  });

  it("queries only payments where charge.memberId matches", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    mockWithTenantSchema(fakeTx);

    await getMemberPaymentHistory(MOCK_PRISMA, CLUB_ID, MEMBER_ID, 1, 20);

    expect(fakeTx.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { charge: { memberId: MEMBER_ID } },
      }),
    );
    expect(fakeTx.payment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { charge: { memberId: MEMBER_ID } },
      }),
    );
  });

  it("includes charge fields in the include clause", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    mockWithTenantSchema(fakeTx);

    await getMemberPaymentHistory(MOCK_PRISMA, CLUB_ID, MEMBER_ID, 1, 20);

    expect(fakeTx.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          charge: expect.objectContaining({
            select: expect.objectContaining({
              id: true,
              dueDate: true,
              status: true,
              method: true,
              amountCents: true,
              gatewayName: true,
              createdAt: true,
            }),
          }),
        }),
      }),
    );
  });

  it("does NOT include gatewayMeta in the charge select", async () => {
    const fakeTx = {
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    mockWithTenantSchema(fakeTx);

    await getMemberPaymentHistory(MOCK_PRISMA, CLUB_ID, MEMBER_ID, 1, 20);

    const call = fakeTx.payment.findMany.mock.calls[0]?.[0] as {
      include?: { charge?: { select?: Record<string, unknown> } };
    };
    expect(call?.include?.charge?.select).not.toHaveProperty("gatewayMeta");
  });
});

describe("findMemberInClub()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { id } when the member exists in the club", async () => {
    const fakeTx = {
      member: {
        findUnique: vi.fn().mockResolvedValue({ id: MEMBER_ID }),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await findMemberInClub(MOCK_PRISMA, CLUB_ID, MEMBER_ID);

    expect(result).toEqual({ id: MEMBER_ID });
  });

  it("returns null when the member does not exist", async () => {
    const fakeTx = {
      member: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    mockWithTenantSchema(fakeTx);

    const result = await findMemberInClub(
      MOCK_PRISMA,
      CLUB_ID,
      "nonexistent-id",
    );

    expect(result).toBeNull();
  });

  it("queries by id and selects only the id field", async () => {
    const fakeTx = {
      member: {
        findUnique: vi.fn().mockResolvedValue({ id: MEMBER_ID }),
      },
    };
    mockWithTenantSchema(fakeTx);

    await findMemberInClub(MOCK_PRISMA, CLUB_ID, MEMBER_ID);

    expect(fakeTx.member.findUnique).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      select: { id: true },
    });
  });

  it("runs inside withTenantSchema with the correct clubId", async () => {
    const fakeTx = {
      member: {
        findUnique: vi.fn().mockResolvedValue({ id: MEMBER_ID }),
      },
    };
    const spy = vi
      .spyOn(prismaLib, "withTenantSchema")
      .mockImplementation(async (_p, _c, fn) =>
        fn(fakeTx as unknown as PrismaClient),
      );

    await findMemberInClub(MOCK_PRISMA, CLUB_ID, MEMBER_ID);

    expect(spy).toHaveBeenCalledWith(
      MOCK_PRISMA,
      CLUB_ID,
      expect.any(Function),
    );
  });
});
