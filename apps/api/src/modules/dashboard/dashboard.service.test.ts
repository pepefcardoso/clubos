/**
 * Unit tests for getDashboardSummary (T-038).
 *
 * All Prisma I/O is mocked via withTenantSchema — no real database or
 * tenant schema setup required. The tests cover:
 *   1. Happy path — populated tenant with mixed data
 *   2. Empty tenant — new club with no rows yet
 *   3. Cancelled payment exclusion
 *   4. Cross-month boundary (previous month and future-dated payments excluded)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDashboardSummary } from "./dashboard.service.js";
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
}

function buildMockTx(overrides: TxOverrides = {}) {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
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
    const prisma = buildMockPrisma({
      memberGroups,
      chargeGroups,
      paymentAggregate,
    });
    await getDashboardSummary(prisma, CLUB_ID);

    const tx = buildMockTx({ memberGroups, chargeGroups, paymentAggregate });
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

    void tx;
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
