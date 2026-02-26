import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateMonthlyCharges,
  getBillingPeriod,
  getDefaultDueDate,
  hasExistingCharge,
} from "./charges.service.js";
import { NoActivePlanError } from "../plans/plans.service.js";
import { assertClubHasActivePlan } from "../plans/plans.service.js";

vi.mock("../plans/plans.service.js", () => ({
  assertClubHasActivePlan: vi.fn().mockResolvedValue(undefined),
  NoActivePlanError: class NoActivePlanError extends Error {
    constructor() {
      super(
        "O clube não possui nenhum plano ativo. Crie ao menos um plano antes de gerar cobranças.",
      );
      this.name = "NoActivePlanError";
    }
  },
}));

let _currentMockTx: ReturnType<typeof buildMockTx>;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_currentMockTx),
  ),
}));

interface MockMemberPlan {
  memberId: string;
  member: { id: string; name: string };
  plan: { id: string; priceCents: number };
  endedAt: null | Date;
}

function buildMockTx(
  overrides: {
    memberPlanFindMany?: MockMemberPlan[];
    chargeFindFirst?: { id: string } | null;
    chargeCreate?: { id: string; amountCents: number; dueDate: Date };
    auditLogCreate?: object;
    chargeCreateError?: Error;
    auditLogCreateError?: Error;
  } = {},
) {
  const defaultCharge = {
    id: "charge-abc",
    amountCents: 9900,
    dueDate: new Date("2025-03-31T23:59:59.999Z"),
  };

  return {
    memberPlan: {
      findMany: vi.fn().mockResolvedValue(overrides.memberPlanFindMany ?? []),
    },
    charge: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.chargeFindFirst !== undefined
            ? overrides.chargeFindFirst
            : null,
        ),
      create: overrides.chargeCreateError
        ? vi.fn().mockRejectedValue(overrides.chargeCreateError)
        : vi.fn().mockResolvedValue(overrides.chargeCreate ?? defaultCharge),
    },
    auditLog: {
      create: overrides.auditLogCreateError
        ? vi.fn().mockRejectedValue(overrides.auditLogCreateError)
        : vi.fn().mockResolvedValue({}),
    },
  };
}

function makeMemberPlan(
  memberId: string,
  memberName: string,
  priceCents = 9900,
  endedAt: null | Date = null,
): MockMemberPlan {
  return {
    memberId,
    member: { id: memberId, name: memberName },
    plan: { id: `plan-${memberId}`, priceCents },
    endedAt,
  };
}

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-001";
const ACTOR_ID = "user-admin-001";

function setMockTx(tx: ReturnType<typeof buildMockTx>) {
  _currentMockTx = tx;
}

describe("getBillingPeriod", () => {
  it("returns current UTC year/month when no argument provided", () => {
    const now = new Date();
    const { year, month } = getBillingPeriod();
    expect(year).toBe(now.getUTCFullYear());
    expect(month).toBe(now.getUTCMonth() + 1);
  });

  it("parses an ISO string and returns the correct year/month", () => {
    const { year, month } = getBillingPeriod("2025-03-15T00:00:00.000Z");
    expect(year).toBe(2025);
    expect(month).toBe(3);
  });

  it("ignores the day component of the provided date", () => {
    const { year, month } = getBillingPeriod("2025-11-28T00:00:00.000Z");
    expect(year).toBe(2025);
    expect(month).toBe(11);
  });
});

describe("getDefaultDueDate", () => {
  it("returns the last day of the given month", () => {
    const due = getDefaultDueDate(2025, 3);
    expect(due.getUTCDate()).toBe(31);
    expect(due.getUTCMonth()).toBe(2);
    expect(due.getUTCFullYear()).toBe(2025);
  });

  it("handles February in a non-leap year (28 days)", () => {
    const due = getDefaultDueDate(2025, 2);
    expect(due.getUTCDate()).toBe(28);
  });

  it("handles February in a leap year (29 days)", () => {
    const due = getDefaultDueDate(2024, 2);
    expect(due.getUTCDate()).toBe(29);
  });

  it("handles months with 30 days", () => {
    const due = getDefaultDueDate(2025, 4);
    expect(due.getUTCDate()).toBe(30);
  });
});

describe("hasExistingCharge", () => {
  it("returns true when a non-cancelled charge exists within the period", async () => {
    const tx = buildMockTx({ chargeFindFirst: { id: "charge-existing" } });
    const result = await hasExistingCharge(tx as never, "member-1", 2025, 3);
    expect(result).toBe(true);
  });

  it("returns false when no charge exists in the period", async () => {
    const tx = buildMockTx({ chargeFindFirst: null });
    const result = await hasExistingCharge(tx as never, "member-1", 2025, 3);
    expect(result).toBe(false);
  });

  it("queries with CANCELLED excluded from the notIn filter", async () => {
    const tx = buildMockTx({ chargeFindFirst: null });
    await hasExistingCharge(tx as never, "member-1", 2025, 3);

    expect(tx.charge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["CANCELLED"] },
        }),
      }),
    );
  });
});

describe("generateMonthlyCharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertClubHasActivePlan).mockResolvedValue(undefined);
  });

  it("TC-1: generates charges for 3 active members with active plans", async () => {
    const members = [
      makeMemberPlan("m1", "Alice", 9900),
      makeMemberPlan("m2", "Bob", 14900),
      makeMemberPlan("m3", "Carol", 4900),
    ];

    let callCount = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.create = vi.fn().mockImplementation(() =>
      Promise.resolve({
        id: `charge-${++callCount}`,
        amountCents: 9900,
        dueDate: new Date("2025-03-31T23:59:59.999Z"),
      }),
    );
    setMockTx(tx);

    const result = await generateMonthlyCharges(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      { billingPeriod: "2025-03-01T00:00:00.000Z" },
    );

    expect(result.generated).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.charges).toHaveLength(3);
  });

  it("TC-2: skips member that already has a PENDING charge this month", async () => {
    const members = [
      makeMemberPlan("m1", "Alice"),
      makeMemberPlan("m2", "Bob"),
      makeMemberPlan("m3", "Carol"),
    ];

    let findFirstCall = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.findFirst = vi.fn().mockImplementation(() => {
      findFirstCall++;
      if (findFirstCall === 2)
        return Promise.resolve({ id: "existing-charge" });
      return Promise.resolve(null);
    });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("TC-3: skips member that already has a PAID charge this month", async () => {
    const members = [
      makeMemberPlan("m1", "Alice"),
      makeMemberPlan("m2", "Bob"),
    ];

    let findFirstCall = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.findFirst = vi.fn().mockImplementation(() => {
      findFirstCall++;
      if (findFirstCall === 1) return Promise.resolve({ id: "paid-charge" });
      return Promise.resolve(null);
    });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("TC-4: generates charge when only a CANCELLED charge exists this month", async () => {
    const members = [makeMemberPlan("m1", "Alice")];

    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.findFirst = vi.fn().mockResolvedValue(null);
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("TC-5: throws NoActivePlanError when club has no active plans", async () => {
    vi.mocked(assertClubHasActivePlan).mockRejectedValue(
      new NoActivePlanError(),
    );

    setMockTx(buildMockTx());

    await expect(
      generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID),
    ).rejects.toThrow(NoActivePlanError);
  });

  it("TC-6: returns zero generated when there are no eligible members", async () => {
    const tx = buildMockTx({ memberPlanFindMany: [] });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.charges).toHaveLength(0);
  });

  it("TC-7: isolates failure — one DB error lands in errors[], others succeed", async () => {
    const members = [
      makeMemberPlan("m1", "Alice"),
      makeMemberPlan("m2", "Bob"),
      makeMemberPlan("m3", "Carol"),
    ];

    let createCall = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.create = vi.fn().mockImplementation(() => {
      createCall++;
      if (createCall === 2) {
        return Promise.reject(new Error("DB connection lost"));
      }
      return Promise.resolve({
        id: `charge-${createCall}`,
        amountCents: 9900,
        dueDate: new Date("2025-03-31T23:59:59.999Z"),
      });
    });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      memberId: "m2",
      reason: "DB connection lost",
    });
  });

  it("TC-8: uses provided billingPeriod to compute the correct due date", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);

    await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      billingPeriod: "2025-02-01T00:00:00.000Z",
    });

    const createCall = tx.charge.create.mock.calls[0]?.[0] as {
      data: { dueDate: Date };
    };
    expect(createCall?.data.dueDate.getUTCDate()).toBe(28);
    expect(createCall?.data.dueDate.getUTCMonth()).toBe(1);
  });

  it("TC-9: uses custom dueDate override instead of last-day-of-month default", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const customDue = "2025-03-15T00:00:00.000Z";
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);

    await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      billingPeriod: "2025-03-01T00:00:00.000Z",
      dueDate: customDue,
    });

    const createCall = tx.charge.create.mock.calls[0]?.[0] as {
      data: { dueDate: Date };
    };
    expect(createCall?.data.dueDate).toEqual(new Date(customDue));
  });

  it("TC-10: does not process members whose MemberPlan has endedAt set", async () => {
    const members = [makeMemberPlan("m1", "Alice", 9900, null)];
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(1);
    expect(tx.memberPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ endedAt: null }),
      }),
    );
  });

  it("TC-11: captures error in errors[] when auditLog.create fails", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.auditLog.create = vi
      .fn()
      .mockRejectedValue(new Error("AuditLog write failed"));
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      memberId: "m1",
      reason: "AuditLog write failed",
    });
    expect(result.generated).toBe(0);
  });

  it("TC-12: creates charge with PIX method, PENDING status, and correct amountCents", async () => {
    const members = [makeMemberPlan("m1", "Alice", 14900)];
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);

    await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(tx.charge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: "m1",
          amountCents: 14900,
          status: "PENDING",
          method: "PIX",
        }),
      }),
    );
  });

  it("TC-13: populates charges[] in result with correct summary fields", async () => {
    const members = [makeMemberPlan("m1", "Alice", 9900)];
    const dueDate = new Date("2025-03-31T23:59:59.999Z");
    const tx = buildMockTx({
      memberPlanFindMany: members,
      chargeCreate: { id: "charge-xyz", amountCents: 9900, dueDate },
    });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.charges[0]).toMatchObject({
      chargeId: "charge-xyz",
      memberId: "m1",
      memberName: "Alice",
      amountCents: 9900,
      dueDate,
    });
  });

  it("TC-14: handles non-Error throws with 'Unknown error' reason", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.create = vi.fn().mockRejectedValue("some string error");
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.errors[0]).toMatchObject({
      memberId: "m1",
      reason: "Unknown error",
    });
  });
});
