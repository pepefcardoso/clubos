import type { PrismaClient } from "../../../generated/prisma/index.js";
import { Prisma } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import type {
  CreatePlanInput,
  UpdatePlanInput,
  ListPlansQuery,
  PlanResponse,
} from "./plans.schema.js";

export class PlanNotFoundError extends Error {
  constructor() {
    super("Plano não encontrado");
    this.name = "PlanNotFoundError";
  }
}

export class DuplicatePlanNameError extends Error {
  constructor() {
    super("Já existe um plano com este nome");
    this.name = "DuplicatePlanNameError";
  }
}

export class PlanHasActiveMembersError extends Error {
  constructor() {
    super("Não é possível excluir um plano com sócios ativos vinculados");
    this.name = "PlanHasActiveMembersError";
  }
}

export class NoActivePlanError extends Error {
  constructor() {
    super(
      "O clube não possui nenhum plano ativo. Crie ao menos um plano antes de gerar cobranças.",
    );
    this.name = "NoActivePlanError";
  }
}

export async function listPlans(
  prisma: PrismaClient,
  clubId: string,
  query: ListPlansQuery,
): Promise<PlanResponse[]> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const plans = await tx.plan.findMany({
      ...(query.activeOnly ? { where: { isActive: true } } : {}),
      orderBy: { createdAt: "asc" },
    });
    return plans;
  });
}

export async function createPlan(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreatePlanInput,
): Promise<PlanResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.plan.findFirst({
      where: { name: input.name },
      select: { id: true },
    });
    if (existing) throw new DuplicatePlanNameError();

    const plan = await tx.plan.create({
      data: {
        name: input.name,
        priceCents: input.priceCents,
        interval: input.interval,
        benefits: input.benefits,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_CREATED",
        entityId: plan.id,
        entityType: "Plan",
        metadata: { name: plan.name, priceCents: plan.priceCents },
      },
    });

    return plan;
  });
}

export async function updatePlan(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  planId: string,
  input: UpdatePlanInput,
): Promise<PlanResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.plan.findUnique({ where: { id: planId } });
    if (!existing) throw new PlanNotFoundError();

    if (input.name !== undefined && input.name !== existing.name) {
      const nameConflict = await tx.plan.findFirst({
        where: { name: input.name, id: { not: planId } },
        select: { id: true },
      });
      if (nameConflict) throw new DuplicatePlanNameError();
    }

    const updated = await tx.plan.update({
      where: { id: planId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
        ...(input.interval !== undefined && { interval: input.interval }),
        ...(input.benefits !== undefined && { benefits: input.benefits }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_UPDATED",
        entityId: planId,
        entityType: "Plan",
        metadata: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue,
      },
    });

    return updated;
  });
}

export async function deletePlan(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  planId: string,
): Promise<void> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new PlanNotFoundError();

    const activeMemberCount = await tx.memberPlan.count({
      where: { planId, endedAt: null },
    });
    if (activeMemberCount > 0) throw new PlanHasActiveMembersError();

    await tx.plan.update({
      where: { id: planId },
      data: { isActive: false },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_DELETED",
        entityId: planId,
        entityType: "Plan",
        metadata: { name: plan.name },
      },
    });
  });
}

/**
 * Asserts that the given club has at least one active plan.
 *
 * Called by ChargeService before generating monthly charges to prevent
 * creating charges against a club with no valid plan configuration.
 *
 * @throws {NoActivePlanError} when the club has zero active plans.
 */
export async function assertClubHasActivePlan(
  prisma: PrismaClient,
  clubId: string,
): Promise<void> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    const count = await tx.plan.count({
      where: { isActive: true },
    });
    if (count === 0) {
      throw new NoActivePlanError();
    }
  });
}
