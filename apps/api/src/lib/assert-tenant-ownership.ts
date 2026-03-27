import type { PrismaClient } from "../../generated/prisma/index.js";
import { NotFoundError } from "./errors.js";

/**
 * Each function asserts that a resource with the given ID exists within
 * the CURRENT tenant schema. They MUST be called inside a `withTenantSchema`
 * callback so `search_path` is already scoped to the authenticated club.
 *
 * Because ClubOS uses schema-per-tenant isolation, querying inside the correct
 * schema IS the ownership check — a row from Club A literally does not exist
 * in Club B's schema. These helpers add a defense-in-depth layer: if a resource
 * is missing (wrong tenant or simply deleted) they throw `NotFoundError` (404)
 * before any mutation can proceed.
 *
 * Security note: always return 404, never 403. Returning 403 would confirm that
 * the resource exists in another tenant, leaking cross-tenant structure.
 */

export async function assertMemberExists(
  prisma: PrismaClient,
  memberId: string,
): Promise<void> {
  const found = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Sócio não encontrado.");
}

export async function assertChargeExists(
  prisma: PrismaClient,
  chargeId: string,
): Promise<void> {
  const found = await prisma.charge.findUnique({
    where: { id: chargeId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Cobrança não encontrada.");
}

export async function assertPlanExists(
  prisma: PrismaClient,
  planId: string,
): Promise<void> {
  const found = await prisma.plan.findUnique({
    where: { id: planId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Plano não encontrado.");
}

export async function assertAthleteExists(
  prisma: PrismaClient,
  athleteId: string,
): Promise<void> {
  const found = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Atleta não encontrado.");
}

export async function assertContractExists(
  prisma: PrismaClient,
  contractId: string,
): Promise<void> {
  const found = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Contrato não encontrado.");
}

export async function assertPaymentExists(
  prisma: PrismaClient,
  paymentId: string,
): Promise<void> {
  const found = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Pagamento não encontrado.");
}

export async function assertRulesConfigExists(
  prisma: PrismaClient,
  rulesConfigId: string,
): Promise<void> {
  const found = await prisma.rulesConfig.findUnique({
    where: { id: rulesConfigId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Configuração de regras não encontrada.");
}

/**
 * Asserts that the requested club ID matches the authenticated user's club.
 *
 * Runs against the PUBLIC schema (no `withTenantSchema` needed) — used by
 * club-level endpoints like logo upload and settings where the URL param
 * `:clubId` must equal `request.user.clubId` from the JWT.
 *
 * No database round-trip: the check is a simple string comparison. The JWT
 * is the source of truth; mismatches return 404 to avoid leaking that the
 * club exists at all.
 */
export async function assertClubBelongsToUser(
  _prisma: PrismaClient,
  clubId: string,
  authenticatedClubId: string,
): Promise<void> {
  if (clubId !== authenticatedClubId) {
    throw new NotFoundError("Clube não encontrado.");
  }
}

export async function assertExpenseExists(
  prisma: PrismaClient,
  expenseId: string,
): Promise<void> {
  const found = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Despesa não encontrada.");
}
