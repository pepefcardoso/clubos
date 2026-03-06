/**
 * Unit tests for getDashboardSummary, getChargesHistory, and getOverdueMembers.
 *
 * All Prisma I/O is mocked via withTenantSchema — no real database or
 * tenant schema setup required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDashboardSummary,
  getChargesHistory,
  getOverdueMembers,
} from "./dashboard.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

type MemberGroupRow = { status: string; _count: { id: number } };
type ChargeGroupRow = {
  status: string;
  _count: { id: number };
  _sum: { amountCents: number | null };
};
type PaymentAggregateResult = {
  _count: { id: number };
  _sum: { amountCents: number | null };
};

interface TxOverrides {
  memberGroups?: MemberGroupRow[];
  chargeGroups?: ChargeGroupRow[];
  paymentAggregate?: PaymentAggregateResult;
  queryRawResults?: unknown[];
}

function buildMockTx(overrides: TxOverrides = {}) {
  const queryRawQueue = overrides.queryRawResults
    ? [...overrides.queryRawResults]
    : [];

  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockImplementation(() => {
      const next = queryRawQueue.shift();
      return Promise.resolve(next ?? []);
    }),
    member: {
      groupBy: vi.fn().mockResolvedValue(overrides.memberGroups ?? []),
    },
    charge: {
      groupBy: vi.fn().mockResolvedValue(overrides.chargeGroups ?? []),
    },
    payment: {
      aggregate: vi.fn().mockResolvedValue(
        overrides.paymentAggregate ?? {
          _count: { id: 0 },
          _sum: { amountCents: null },
        },
      ),
    },
  };
}

function buildMockPrisma(txOverrides: TxOverrides = {}): PrismaClient {
  const tx = buildMockTx(txOverrides);
  return {
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
}

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      prisma: PrismaClient,
      _clubId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) =>
      (
        prisma as unknown as {
          $transaction: (
            fn: (tx: unknown) => Promise<unknown>,
          ) => Promise<unknown>;
        }
      ).$transaction(fn),
  ),
}));

const CLUB_ID = "club_test_123";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDashboardSummary — populated tenant", () => {
  const memberGroups: MemberGroupRow[] = [
    { status: "ACTIVE", _count: { id: 42 } },
    { status: "INACTIVE", _count: { id: 5 } },
    { status: "OVERDUE", _count: { id: 8 } },
  ];

  const chargeGroups: ChargeGroupRow[] = [
    { status: "PENDING", _count: { id: 30 }, _sum: { amountCents: 150000 } },
    { status: "OVERDUE", _count: { id: 8 }, _sum: { amountCents: 40000 } },
  ];

  const paymentAggregate: PaymentAggregateResult = {
    _count: { id: 35 },
    _sum: { amountCents: 175000 },
  };

  it("returns correct member totals", async () => {
    const prisma = buildMockPrisma({
      memberGroups,
      chargeGroups,
      paymentAggregate,
    });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.members.total).toBe(55);
    expect(result.members.active).toBe(42);
    expect(result.members.inactive).toBe(5);
    expect(result.members.overdue).toBe(8);
  });

  it("returns correct pending charge aggregates", async () => {
    const prisma = buildMockPrisma({
      memberGroups,
      chargeGroups,
      paymentAggregate,
    });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.charges.pendingCount).toBe(30);
    expect(result.charges.pendingAmountCents).toBe(150000);
  });

  it("returns correct overdue charge aggregates", async () => {
    const prisma = buildMockPrisma({
      memberGroups,
      chargeGroups,
      paymentAggregate,
    });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.charges.overdueCount).toBe(8);
    expect(result.charges.overdueAmountCents).toBe(40000);
  });

  it("returns paid-this-month figures from payments aggregate, not charge status", async () => {
    const prisma = buildMockPrisma({
      memberGroups,
      chargeGroups,
      paymentAggregate,
    });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.payments.paidThisMonthCount).toBe(35);
    expect(result.payments.paidThisMonthAmountCents).toBe(175000);
  });

  it("queries charges only for PENDING and OVERDUE statuses", async () => {
    const spyTx = buildMockTx({ memberGroups, chargeGroups, paymentAggregate });
    const spyPrisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    await getDashboardSummary(spyPrisma, CLUB_ID);

    expect(spyTx.charge.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["PENDING", "OVERDUE"] } },
      }),
    );
  });

  it("filters payments aggregate with cancelledAt: null", async () => {
    const spyTx = buildMockTx({ memberGroups, chargeGroups, paymentAggregate });
    const spyPrisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    await getDashboardSummary(spyPrisma, CLUB_ID);

    expect(spyTx.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cancelledAt: null }),
      }),
    );
  });
});

describe("getDashboardSummary — empty tenant", () => {
  it("returns all-zero summary when no members, charges, or payments exist", async () => {
    const prisma = buildMockPrisma();
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result).toEqual({
      members: { total: 0, active: 0, inactive: 0, overdue: 0 },
      charges: {
        pendingCount: 0,
        pendingAmountCents: 0,
        overdueCount: 0,
        overdueAmountCents: 0,
      },
      payments: { paidThisMonthCount: 0, paidThisMonthAmountCents: 0 },
    });
  });

  it("never returns null or undefined for any numeric field", async () => {
    const prisma = buildMockPrisma();
    const result = await getDashboardSummary(prisma, CLUB_ID);

    for (const section of Object.values(result)) {
      for (const val of Object.values(section as Record<string, unknown>)) {
        expect(val).not.toBeNull();
        expect(val).not.toBeUndefined();
        expect(typeof val).toBe("number");
      }
    }
  });
});

describe("getDashboardSummary — cancelled payments", () => {
  it("excludes cancelled payments: paidThisMonth reflects only non-cancelled rows", async () => {
    const paymentAggregate: PaymentAggregateResult = {
      _count: { id: 10 },
      _sum: { amountCents: 50000 },
    };

    const spyTx = buildMockTx({ paymentAggregate });
    const spyPrisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getDashboardSummary(spyPrisma, CLUB_ID);

    expect(spyTx.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cancelledAt: null }),
      }),
    );
    expect(result.payments.paidThisMonthCount).toBe(10);
    expect(result.payments.paidThisMonthAmountCents).toBe(50000);
  });
});

describe("getDashboardSummary — month boundary filtering", () => {
  it("passes gte:startOfMonth and lt:startOfNextMonth to payments aggregate", async () => {
    const now = new Date();
    const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const expectedEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const spyTx = buildMockTx();
    const spyPrisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    await getDashboardSummary(spyPrisma, CLUB_ID);

    expect(spyTx.payment.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paidAt: {
            gte: expectedStart,
            lt: expectedEnd,
          },
        }),
      }),
    );
  });

  it("excludes payments from the previous month (returns 0 when only prior-month payments exist)", async () => {
    const prisma = buildMockPrisma();
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.payments.paidThisMonthCount).toBe(0);
    expect(result.payments.paidThisMonthAmountCents).toBe(0);
  });

  it("excludes future-dated payments (uses lt startOfNextMonth, not lte endOfMonth)", async () => {
    const paymentAggregate: PaymentAggregateResult = {
      _count: { id: 0 },
      _sum: { amountCents: null },
    };

    const prisma = buildMockPrisma({ paymentAggregate });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.payments.paidThisMonthAmountCents).toBe(0);
  });
});

describe("getDashboardSummary — partial data", () => {
  it("returns 0 for overdue charges when no OVERDUE charges exist", async () => {
    const chargeGroups: ChargeGroupRow[] = [
      { status: "PENDING", _count: { id: 10 }, _sum: { amountCents: 50000 } },
    ];

    const prisma = buildMockPrisma({ chargeGroups });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.charges.overdueCount).toBe(0);
    expect(result.charges.overdueAmountCents).toBe(0);
  });

  it("sums amountCents to 0 when Prisma returns null _sum (empty bucket)", async () => {
    const chargeGroups: ChargeGroupRow[] = [
      { status: "PENDING", _count: { id: 3 }, _sum: { amountCents: null } },
    ];

    const prisma = buildMockPrisma({ chargeGroups });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.charges.pendingAmountCents).toBe(0);
  });

  it("counts only the statuses present in memberGroups when some are missing", async () => {
    const memberGroups: MemberGroupRow[] = [
      { status: "ACTIVE", _count: { id: 20 } },
    ];

    const prisma = buildMockPrisma({ memberGroups });
    const result = await getDashboardSummary(prisma, CLUB_ID);

    expect(result.members.total).toBe(20);
    expect(result.members.active).toBe(20);
    expect(result.members.inactive).toBe(0);
    expect(result.members.overdue).toBe(0);
  });
});

describe("getChargesHistory — happy path", () => {
  it("returns an array with exactly `months` entries", async () => {
    const spyTx = buildMockTx({ queryRawResults: [[]] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID, 3);

    expect(result).toHaveLength(3);
  });

  it("all entries have the required shape with numeric fields", async () => {
    const spyTx = buildMockTx({ queryRawResults: [[]] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID, 2);

    for (const entry of result) {
      expect(typeof entry.month).toBe("string");
      expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof entry.paid).toBe("number");
      expect(typeof entry.overdue).toBe("number");
      expect(typeof entry.pending).toBe("number");
      expect(typeof entry.paidAmountCents).toBe("number");
      expect(typeof entry.overdueAmountCents).toBe("number");
    }
  });

  it("zero-fills months with no raw rows", async () => {
    const spyTx = buildMockTx({ queryRawResults: [[]] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID, 4);

    for (const entry of result) {
      expect(entry.paid).toBe(0);
      expect(entry.overdue).toBe(0);
      expect(entry.pending).toBe(0);
      expect(entry.paidAmountCents).toBe(0);
      expect(entry.overdueAmountCents).toBe(0);
    }
  });

  it("maps PAID rows to paid count and paidAmountCents", async () => {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const rawRows = [
      {
        month: monthKey,
        status: "PAID",
        count: BigInt(12),
        amount_cents: BigInt(60000),
      },
    ];

    const spyTx = buildMockTx({ queryRawResults: [rawRows] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID, 1);
    const thisMonth = result[result.length - 1]!;

    expect(thisMonth.paid).toBe(12);
    expect(thisMonth.paidAmountCents).toBe(60000);
  });

  it("maps OVERDUE rows to overdue count and overdueAmountCents", async () => {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const rawRows = [
      {
        month: monthKey,
        status: "OVERDUE",
        count: BigInt(5),
        amount_cents: BigInt(25000),
      },
    ];

    const spyTx = buildMockTx({ queryRawResults: [rawRows] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID, 1);
    const thisMonth = result[result.length - 1]!;

    expect(thisMonth.overdue).toBe(5);
    expect(thisMonth.overdueAmountCents).toBe(25000);
  });

  it("maps PENDING and PENDING_RETRY rows to the pending count only", async () => {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const rawRows = [
      {
        month: monthKey,
        status: "PENDING",
        count: BigInt(7),
        amount_cents: BigInt(35000),
      },
      {
        month: monthKey,
        status: "PENDING_RETRY",
        count: BigInt(2),
        amount_cents: BigInt(10000),
      },
    ];

    const spyTx = buildMockTx({ queryRawResults: [rawRows] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID, 1);
    const thisMonth = result[result.length - 1]!;

    expect(thisMonth.pending).toBe(9);
  });

  it("returns entries ordered oldest-first", async () => {
    const spyTx = buildMockTx({ queryRawResults: [[]] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID, 3);

    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.month >= result[i - 1]!.month).toBe(true);
    }
  });

  it("uses default months=6 when not specified", async () => {
    const spyTx = buildMockTx({ queryRawResults: [[]] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getChargesHistory(prisma, CLUB_ID);

    expect(result).toHaveLength(6);
  });
});

describe("getOverdueMembers — happy path", () => {
  const mockRows = [
    {
      member_id: "mem_001",
      member_name: "João Silva",
      charge_id: "chg_001",
      amount_cents: BigInt(9900),
      due_date: new Date("2025-01-10"),
    },
    {
      member_id: "mem_002",
      member_name: "Maria Santos",
      charge_id: "chg_002",
      amount_cents: BigInt(14900),
      due_date: new Date("2025-01-15"),
    },
  ];
  const mockCount = [{ count: BigInt(2) }];

  it("returns data, total, page, and limit in result", async () => {
    const spyTx = buildMockTx({ queryRawResults: [mockRows, mockCount] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getOverdueMembers(prisma, CLUB_ID, 1, 20);

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("maps raw SQL columns to camelCase OverdueMemberRow fields", async () => {
    const spyTx = buildMockTx({ queryRawResults: [mockRows, mockCount] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getOverdueMembers(prisma, CLUB_ID, 1, 20);
    const first = result.data[0]!;

    expect(first.memberId).toBe("mem_001");
    expect(first.memberName).toBe("João Silva");
    expect(first.chargeId).toBe("chg_001");
    expect(first.amountCents).toBe(9900);
    expect(first.dueDate).toBeInstanceOf(Date);
  });

  it("converts BigInt amount_cents to Number", async () => {
    const spyTx = buildMockTx({ queryRawResults: [mockRows, mockCount] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getOverdueMembers(prisma, CLUB_ID, 1, 20);

    for (const row of result.data) {
      expect(typeof row.amountCents).toBe("number");
    }
  });

  it("computes daysPastDue as a non-negative integer", async () => {
    const spyTx = buildMockTx({ queryRawResults: [mockRows, mockCount] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getOverdueMembers(prisma, CLUB_ID, 1, 20);

    for (const row of result.data) {
      expect(row.daysPastDue).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(row.daysPastDue)).toBe(true);
    }
  });
});

describe("getOverdueMembers — empty result", () => {
  it("returns empty data and total=0 when no overdue members exist", async () => {
    const spyTx = buildMockTx({
      queryRawResults: [[], [{ count: BigInt(0) }]],
    });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getOverdueMembers(prisma, CLUB_ID, 1, 20);

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("handles missing countResult gracefully (total defaults to 0)", async () => {
    const spyTx = buildMockTx({ queryRawResults: [[], []] });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getOverdueMembers(prisma, CLUB_ID, 1, 20);

    expect(result.total).toBe(0);
  });
});

describe("getOverdueMembers — pagination", () => {
  it("reflects the requested page and limit in the result", async () => {
    const spyTx = buildMockTx({
      queryRawResults: [[], [{ count: BigInt(50) }]],
    });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
          fn(spyTx),
        ),
    } as unknown as PrismaClient;

    const result = await getOverdueMembers(prisma, CLUB_ID, 3, 10);

    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(50);
  });
});
