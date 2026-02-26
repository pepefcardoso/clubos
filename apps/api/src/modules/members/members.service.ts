import type { PrismaClient } from "../../../generated/prisma/index.js";
import { Prisma } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import {
  encryptField,
  decryptField,
  findMemberByCpf,
  getEncryptionKey,
} from "../../lib/crypto.js";
import type {
  CreateMemberInput,
  UpdateMemberInput,
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

export class MemberNotFoundError extends Error {
  constructor() {
    super("Sócio não encontrado");
    this.name = "MemberNotFoundError";
  }
}

interface DecryptedMemberRow {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string | null;
  status: string;
  joinedAt: Date;
}

async function loadActivePlans(
  tx: PrismaClient,
  memberIds: string[],
): Promise<Map<string, MemberPlanSummary[]>> {
  if (memberIds.length === 0) return new Map();

  const memberPlans = await tx.memberPlan.findMany({
    where: { memberId: { in: memberIds }, endedAt: null },
    include: {
      plan: { select: { id: true, name: true, priceCents: true } },
    },
  });

  const map = new Map<string, MemberPlanSummary[]>();
  for (const mp of memberPlans) {
    const existing = map.get(mp.memberId) ?? [];
    existing.push({
      id: mp.plan.id,
      name: mp.plan.name,
      priceCents: mp.plan.priceCents,
    });
    map.set(mp.memberId, existing);
  }
  return map;
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

    const existing = await findMemberByCpf(tx, input.cpf);
    if (existing) {
      throw new DuplicateCpfError();
    }

    const [encryptedCpf, encryptedPhone] = await Promise.all([
      encryptField(tx, input.cpf),
      encryptField(tx, input.phone),
    ]);

    const member = await tx.member.create({
      data: {
        name: input.name,
        cpf: encryptedCpf,
        phone: encryptedPhone,
        email: input.email ?? null,
        ...(input.joinedAt ? { joinedAt: new Date(input.joinedAt) } : {}),
      },
    });

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

    const [cpf, phone] = await Promise.all([
      decryptField(tx, member.cpf),
      decryptField(tx, member.phone),
    ]);

    const plans: MemberPlanSummary[] = [];
    if (input.planId) {
      const plan = await tx.plan.findUnique({
        where: { id: input.planId },
        select: { id: true, name: true, priceCents: true },
      });
      if (plan) plans.push(plan);
    }

    return {
      id: member.id,
      name: member.name,
      cpf,
      phone,
      email: member.email,
      status: member.status,
      joinedAt: member.joinedAt,
      plans,
    };
  });
}

export async function getMemberById(
  prisma: PrismaClient,
  clubId: string,
  memberId: string,
): Promise<MemberResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const member = await tx.member.findUnique({
      where: { id: memberId },
    });
    if (!member) throw new MemberNotFoundError();

    const [cpf, phone] = await Promise.all([
      decryptField(tx, member.cpf),
      decryptField(tx, member.phone),
    ]);

    const plansMap = await loadActivePlans(tx, [memberId]);

    return {
      id: member.id,
      name: member.name,
      cpf,
      phone,
      email: member.email,
      status: member.status,
      joinedAt: member.joinedAt,
      plans: plansMap.get(memberId) ?? [],
    };
  });
}

export async function updateMember(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  memberId: string,
  input: UpdateMemberInput,
): Promise<MemberResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.member.findUnique({ where: { id: memberId } });
    if (!existing) throw new MemberNotFoundError();

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.email !== undefined) data["email"] = input.email;
    if (input.status !== undefined) data["status"] = input.status;
    if (input.phone !== undefined) {
      data["phone"] = await encryptField(tx, input.phone);
    }

    const updated = await tx.member.update({
      where: { id: memberId },
      data: data as Parameters<typeof tx.member.update>[0]["data"],
    });

    if ("planId" in input) {
      await tx.memberPlan.updateMany({
        where: { memberId, endedAt: null },
        data: { endedAt: new Date() },
      });
      if (input.planId != null) {
        await tx.memberPlan.create({
          data: { memberId, planId: input.planId },
        });
      }
    }

    const auditMeta: Record<string, unknown> = {};
    if (input.name !== undefined) auditMeta["name"] = input.name;
    if (input.email !== undefined) auditMeta["email"] = input.email;
    if (input.phone !== undefined) auditMeta["phone"] = "[REDACTED]";
    if (input.status !== undefined) auditMeta["status"] = input.status;
    if ("planId" in input) auditMeta["planId"] = input.planId ?? null;

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEMBER_UPDATED",
        entityId: memberId,
        entityType: "Member",
        metadata: auditMeta as Prisma.InputJsonValue,
      },
    });

    const [cpf, phone] = await Promise.all([
      decryptField(tx, updated.cpf),
      decryptField(tx, updated.phone),
    ]);

    const plansMap = await loadActivePlans(tx, [memberId]);

    return {
      id: updated.id,
      name: updated.name,
      cpf,
      phone,
      email: updated.email,
      status: updated.status,
      joinedAt: updated.joinedAt,
      plans: plansMap.get(memberId) ?? [],
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
  const key = getEncryptionKey();

  return withTenantSchema(prisma, clubId, async (tx) => {
    const statusFilter = status
      ? Prisma.sql`AND m.status = ${status}::\"MemberStatus\"`
      : Prisma.sql``;

    const searchFilter =
      search && search.trim() !== ""
        ? Prisma.sql`
            AND (
              m.name ILIKE ${"%" + search + "%"}
              OR pgp_sym_decrypt(m.cpf::bytea, ${key}::text) LIKE ${"%" + search + "%"}
            )
          `
        : Prisma.sql``;

    const [rows, total] = await Promise.all([
      tx.$queryRaw<DecryptedMemberRow[]>`
        SELECT
          m.id,
          m.name,
          pgp_sym_decrypt(m.cpf::bytea,   ${key}::text) AS cpf,
          pgp_sym_decrypt(m.phone::bytea, ${key}::text) AS phone,
          m.email,
          m.status::text AS status,
          m."joinedAt"
        FROM members m
        WHERE TRUE
          ${statusFilter}
          ${searchFilter}
        ORDER BY m.name ASC
        LIMIT ${limit} OFFSET ${skip}
      `,
      tx.member.count({
        where: {
          ...(status ? { status: status as MemberStatus } : {}),
          ...(search && search.trim() !== ""
            ? {
                name: { contains: search, mode: "insensitive" as const },
              }
            : {}),
        },
      }),
    ]);

    const memberIds = rows.map((r) => r.id);
    const plansMap = await loadActivePlans(tx, memberIds);

    const data: MemberResponse[] = rows.map((m) => ({
      id: m.id,
      name: m.name,
      cpf: m.cpf,
      phone: m.phone,
      email: m.email,
      status: m.status,
      joinedAt: m.joinedAt,
      plans: plansMap.get(m.id) ?? [],
    }));

    return { data, total, page, limit };
  });
}
