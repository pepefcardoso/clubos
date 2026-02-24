import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { isPrismaUniqueConstraintError } from "../../lib/prisma.js";
import type {
  CreateMemberInput,
  ListMembersQuery,
  MemberPlanSummary,
  MemberResponse,
} from "./members.schema.js";
import type { MemberStatus, PaginatedResponse } from "@clubos/shared-types";

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

    const plans: MemberPlanSummary[] = [];
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

export async function listMembers(
  prisma: PrismaClient,
  clubId: string,
  params: ListMembersQuery,
): Promise<PaginatedResponse<MemberResponse>> {
  const { page, limit, search, status } = params;
  const skip = (page - 1) * limit;

  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = {
      ...(status ? { status: status as MemberStatus } : {}),
      ...(search && search.trim() !== ""
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { cpf: { contains: search } },
            ],
          }
        : {}),
    };

    const [members, total] = await Promise.all([
      tx.member.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          plans: {
            where: { endedAt: null },
            include: {
              plan: { select: { id: true, name: true } },
            },
          },
        },
      }),
      tx.member.count({ where }),
    ]);

    const data: MemberResponse[] = members.map(
      (m: {
        id: string;
        name: string;
        cpf: string;
        phone: string;
        email: string | null;
        status: string;
        joinedAt: Date;
        plans: Array<{ plan: { id: string; name: string } }>;
      }) => ({
        id: m.id,
        name: m.name,
        cpf: m.cpf,
        phone: m.phone,
        email: m.email,
        status: m.status,
        joinedAt: m.joinedAt,
        plans: m.plans.map((mp) => ({ id: mp.plan.id, name: mp.plan.name })),
      }),
    );

    return { data, total, page, limit };
  });
}
