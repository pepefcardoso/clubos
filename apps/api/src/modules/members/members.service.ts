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

// ---------------------------------------------------------------------------
// Internal row type returned by the bulk-decrypt raw query in listMembers.
// ---------------------------------------------------------------------------
interface DecryptedMemberRow {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string | null;
  status: string;
  joinedAt: Date;
}

// ---------------------------------------------------------------------------
// createMember
// ---------------------------------------------------------------------------

export async function createMember(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateMemberInput,
): Promise<MemberResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    // Plan validation (must happen before the uniqueness check to keep error
    // ordering consistent and avoid unnecessary decrypt scans)
    if (input.planId) {
      const plan = await tx.plan.findUnique({ where: { id: input.planId } });
      if (!plan || !plan.isActive) {
        throw new PlanNotFoundError();
      }
    }

    // Uniqueness check — replaces the removed @unique DB constraint on cpf.
    const existing = await findMemberByCpf(tx, input.cpf);
    if (existing) {
      throw new DuplicateCpfError();
    }

    // Encrypt CPF and phone before persisting
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

    // Decrypt for the response — plaintext only in memory, never re-persisted
    const [cpf, phone] = await Promise.all([
      decryptField(tx, member.cpf),
      decryptField(tx, member.phone),
    ]);

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
      cpf,
      phone,
      email: member.email,
      status: member.status,
      joinedAt: member.joinedAt,
      plans,
    };
  });
}

// ---------------------------------------------------------------------------
// listMembers
// ---------------------------------------------------------------------------

export async function listMembers(
  prisma: PrismaClient,
  clubId: string,
  params: ListMembersQuery,
): Promise<PaginatedResponse<MemberResponse>> {
  const { page, limit, search, status } = params;
  const skip = (page - 1) * limit;
  const key = getEncryptionKey();

  return withTenantSchema(prisma, clubId, async (tx) => {
    // Build a single raw query that decrypts cpf and phone inline.
    // This avoids N+1 per-row decryption calls and keeps all decryption
    // inside the DB where the key is used transiently.
    //
    // The WHERE clause uses Prisma.sql tagged-template for safe parameterisation;
    // the key is passed as a bound parameter, never interpolated as a string.

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
          // Note: CPF search with encryption requires the raw query above;
          // the Prisma count() only filters by name for the total count when
          // a search term is present. This is a known v1 limitation — the
          // count may be slightly off when searching by CPF. Fix in T-xxx.
          ...(search && search.trim() !== ""
            ? {
                name: { contains: search, mode: "insensitive" as const },
              }
            : {}),
        },
      }),
    ]);

    // Fetch plan associations for the returned page of members
    const memberIds = rows.map((r) => r.id);
    const memberPlans =
      memberIds.length > 0
        ? await tx.memberPlan.findMany({
            where: {
              memberId: { in: memberIds },
              endedAt: null,
            },
            include: {
              plan: { select: { id: true, name: true } },
            },
          })
        : [];

    const plansByMemberId = new Map<string, MemberPlanSummary[]>();
    for (const mp of memberPlans) {
      const existing = plansByMemberId.get(mp.memberId) ?? [];
      existing.push({ id: mp.plan.id, name: mp.plan.name });
      plansByMemberId.set(mp.memberId, existing);
    }

    const data: MemberResponse[] = rows.map((m) => ({
      id: m.id,
      name: m.name,
      cpf: m.cpf,
      phone: m.phone,
      email: m.email,
      status: m.status,
      joinedAt: m.joinedAt,
      plans: plansByMemberId.get(m.id) ?? [],
    }));

    return { data, total, page, limit };
  });
}
