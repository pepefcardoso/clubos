import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  PlanNotFoundError,
  DuplicatePlanNameError,
  PlanHasActiveMembersError,
} from "./plans.service.js";

const mockTx = {
  plan: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  memberPlan: {
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: string,
      fn: (tx: typeof mockTx) => Promise<unknown>,
    ) => fn(mockTx),
  ),
}));

const mockPrisma = {} as never;
const CLUB_ID = "club_test_123";
const ACTOR_ID = "user_test_456";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listPlans", () => {
  it("returns all plans when activeOnly = false", async () => {
    const fakePlans = [
      { id: "plan_1", name: "Bronze", isActive: true },
      { id: "plan_2", name: "Prata", isActive: false },
    ];
    mockTx.plan.findMany.mockResolvedValue(fakePlans);

    const result = await listPlans(mockPrisma, CLUB_ID, { activeOnly: false });

    expect(mockTx.plan.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: "asc" },
    });
    expect(result).toEqual(fakePlans);
  });

  it("returns only active plans when activeOnly = true", async () => {
    const fakePlans = [{ id: "plan_1", name: "Bronze", isActive: true }];
    mockTx.plan.findMany.mockResolvedValue(fakePlans);

    const result = await listPlans(mockPrisma, CLUB_ID, { activeOnly: true });

    expect(mockTx.plan.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
    expect(result).toEqual(fakePlans);
  });

  it("returns empty array for a club with no plans", async () => {
    mockTx.plan.findMany.mockResolvedValue([]);

    const result = await listPlans(mockPrisma, CLUB_ID, { activeOnly: false });

    expect(result).toEqual([]);
  });
});

describe("createPlan", () => {
  const validInput = {
    name: "Sócio Ouro",
    priceCents: 4990,
    interval: "monthly" as const,
    benefits: ["Entrada gratuita", "Desconto no bar"],
  };

  it("creates plan and returns full PlanResponse", async () => {
    mockTx.plan.findFirst.mockResolvedValue(null);
    const fakePlan = {
      id: "plan_new",
      ...validInput,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockTx.plan.create.mockResolvedValue(fakePlan);
    mockTx.auditLog.create.mockResolvedValue({});

    const result = await createPlan(mockPrisma, CLUB_ID, ACTOR_ID, validInput);

    expect(mockTx.plan.create).toHaveBeenCalledWith({
      data: {
        name: validInput.name,
        priceCents: validInput.priceCents,
        interval: validInput.interval,
        benefits: validInput.benefits,
      },
    });
    expect(result).toEqual(fakePlan);
  });

  it("creates audit log entry with action PLAN_CREATED", async () => {
    mockTx.plan.findFirst.mockResolvedValue(null);
    const fakePlan = {
      id: "plan_audit",
      ...validInput,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockTx.plan.create.mockResolvedValue(fakePlan);
    mockTx.auditLog.create.mockResolvedValue({});

    await createPlan(mockPrisma, CLUB_ID, ACTOR_ID, validInput);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ACTOR_ID,
        action: "PLAN_CREATED",
        entityId: fakePlan.id,
        entityType: "Plan",
        metadata: { name: fakePlan.name, priceCents: fakePlan.priceCents },
      },
    });
  });

  it("throws DuplicatePlanNameError when name already exists", async () => {
    mockTx.plan.findFirst.mockResolvedValue({ id: "plan_existing" });

    await expect(
      createPlan(mockPrisma, CLUB_ID, ACTOR_ID, validInput),
    ).rejects.toThrow(DuplicatePlanNameError);

    expect(mockTx.plan.create).not.toHaveBeenCalled();
  });
});

describe("updatePlan", () => {
  const PLAN_ID = "plan_update_test";
  const existingPlan = {
    id: PLAN_ID,
    name: "Sócio Prata",
    priceCents: 2990,
    interval: "monthly",
    benefits: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("partial update (only priceCents) leaves other fields unchanged", async () => {
    mockTx.plan.findUnique.mockResolvedValue(existingPlan);
    const updatedPlan = { ...existingPlan, priceCents: 3490 };
    mockTx.plan.update.mockResolvedValue(updatedPlan);
    mockTx.auditLog.create.mockResolvedValue({});

    const result = await updatePlan(mockPrisma, CLUB_ID, ACTOR_ID, PLAN_ID, {
      priceCents: 3490,
    });

    expect(mockTx.plan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { priceCents: 3490 },
    });
    expect(result.priceCents).toBe(3490);
    expect(result.name).toBe(existingPlan.name);
  });

  it("can deactivate a plan by setting isActive: false", async () => {
    mockTx.plan.findUnique.mockResolvedValue(existingPlan);
    const updatedPlan = { ...existingPlan, isActive: false };
    mockTx.plan.update.mockResolvedValue(updatedPlan);
    mockTx.auditLog.create.mockResolvedValue({});

    const result = await updatePlan(mockPrisma, CLUB_ID, ACTOR_ID, PLAN_ID, {
      isActive: false,
    });

    expect(mockTx.plan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { isActive: false },
    });
    expect(result.isActive).toBe(false);
  });

  it("creates audit log entry with action PLAN_UPDATED", async () => {
    mockTx.plan.findUnique.mockResolvedValue(existingPlan);
    mockTx.plan.update.mockResolvedValue(existingPlan);
    mockTx.auditLog.create.mockResolvedValue({});

    const input = { priceCents: 3990 };
    await updatePlan(mockPrisma, CLUB_ID, ACTOR_ID, PLAN_ID, input);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ACTOR_ID,
        action: "PLAN_UPDATED",
        entityId: PLAN_ID,
        entityType: "Plan",
        metadata: input,
      },
    });
  });

  it("throws PlanNotFoundError for unknown planId", async () => {
    mockTx.plan.findUnique.mockResolvedValue(null);

    await expect(
      updatePlan(mockPrisma, CLUB_ID, ACTOR_ID, "nonexistent_plan", {
        priceCents: 1000,
      }),
    ).rejects.toThrow(PlanNotFoundError);

    expect(mockTx.plan.update).not.toHaveBeenCalled();
  });

  it("throws DuplicatePlanNameError when renaming to an existing name", async () => {
    mockTx.plan.findUnique.mockResolvedValue(existingPlan);
    mockTx.plan.findFirst.mockResolvedValue({ id: "plan_other" });

    await expect(
      updatePlan(mockPrisma, CLUB_ID, ACTOR_ID, PLAN_ID, {
        name: "Sócio Ouro",
      }),
    ).rejects.toThrow(DuplicatePlanNameError);

    expect(mockTx.plan.update).not.toHaveBeenCalled();
  });
});

describe("deletePlan", () => {
  const PLAN_ID = "plan_delete_test";
  const existingPlan = {
    id: PLAN_ID,
    name: "Sócio Bronze",
    priceCents: 1990,
    interval: "monthly",
    benefits: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("sets isActive = false (does NOT remove row from DB)", async () => {
    mockTx.plan.findUnique.mockResolvedValue(existingPlan);
    mockTx.memberPlan.count.mockResolvedValue(0);
    mockTx.plan.update.mockResolvedValue({ ...existingPlan, isActive: false });
    mockTx.auditLog.create.mockResolvedValue({});

    await deletePlan(mockPrisma, CLUB_ID, ACTOR_ID, PLAN_ID);

    expect(mockTx.plan.update).toHaveBeenCalledWith({
      where: { id: PLAN_ID },
      data: { isActive: false },
    });
  });

  it("creates audit log entry with action PLAN_DELETED", async () => {
    mockTx.plan.findUnique.mockResolvedValue(existingPlan);
    mockTx.memberPlan.count.mockResolvedValue(0);
    mockTx.plan.update.mockResolvedValue({ ...existingPlan, isActive: false });
    mockTx.auditLog.create.mockResolvedValue({});

    await deletePlan(mockPrisma, CLUB_ID, ACTOR_ID, PLAN_ID);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ACTOR_ID,
        action: "PLAN_DELETED",
        entityId: PLAN_ID,
        entityType: "Plan",
        metadata: { name: existingPlan.name },
      },
    });
  });

  it("throws PlanNotFoundError for unknown planId", async () => {
    mockTx.plan.findUnique.mockResolvedValue(null);

    await expect(
      deletePlan(mockPrisma, CLUB_ID, ACTOR_ID, "nonexistent_plan"),
    ).rejects.toThrow(PlanNotFoundError);

    expect(mockTx.plan.update).not.toHaveBeenCalled();
  });

  it("throws PlanHasActiveMembersError when active MemberPlan rows exist", async () => {
    mockTx.plan.findUnique.mockResolvedValue(existingPlan);
    mockTx.memberPlan.count.mockResolvedValue(3);

    await expect(
      deletePlan(mockPrisma, CLUB_ID, ACTOR_ID, PLAN_ID),
    ).rejects.toThrow(PlanHasActiveMembersError);

    expect(mockTx.plan.update).not.toHaveBeenCalled();
  });
});
