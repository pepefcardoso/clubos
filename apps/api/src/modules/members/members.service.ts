import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import type { CreateMemberInput, MemberResponse } from "./members.schema.js";

export class DuplicateCpfError extends Error {
  constructor() {
    super("Sócio com este CPF já está cadastrado");
    this.name = "DuplicateCpfError";
  }
}

export class PlanNotFoundError extends Error {
  constructor() {
    super("Plano não encontrado ou inativo");
    this.name = "PlanNotFoundError";
  }
}

function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

export async function createMember(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateMemberInput,
): Promise<MemberResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    if (input.planId) {
      const plan = await tx.plan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.isActive) {
        throw new PlanNotFoundError();
      }
    }

    let member;
    try {
      member = await tx.member.create({
        data: {
          name: input.name,
          cpf: input.cpf,
          phone: input.phone,
          email: input.email ?? null,
          joinedAt: input.joinedAt ? new Date(input.joinedAt) : undefined,
        },
      });
    } catch (err) {
      if (isPrismaUniqueConstraintError(err)) throw new DuplicateCpfError();
      throw err;
    }

    if (input.planId) {
      await tx.memberPlan.create({
        data: { memberId: member.id, planId: input.planId },
      });
    }

    await tx.auditLog.create({
      data: {
        memberId: member.id,
        actorId,
        action: "MEMBER_CREATED",
        entityId: member.id,
        entityType: "Member",
      },
    });

    const plans: Array<{ id: string; name: string }> = [];
    if (input.planId) {
      const plan = await tx.plan.findUnique({
        where: { id: input.planId },
        select: { id: true, name: true },
      });
      if (plan) plans.push(plan);
    }

    return {
      id: member.id,
      name: member.name,
      cpf: member.cpf,
      phone: member.phone,
      email: member.email,
      status: member.status,
      joinedAt: member.joinedAt,
      plans,
    };
  });
}
