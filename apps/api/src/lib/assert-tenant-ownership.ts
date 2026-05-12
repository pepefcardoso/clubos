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

/**
 * Asserts that an Event with the given ID exists within the CURRENT tenant schema.
 *
 * MUST be called inside a `withTenantSchema` callback.
 * Returns 404 (never 403) — returning 403 would confirm the event exists in
 * another tenant, leaking cross-tenant structure.
 */
export async function assertEventExists(
  prisma: PrismaClient,
  eventId: string,
): Promise<void> {
  const found = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Evento não encontrado.");
}

/**
 * Asserts that an EventSector with the given sectorId belongs to the given eventId
 * within the CURRENT tenant schema.
 *
 * Both the sectorId and its eventId are verified together, preventing a sector
 * from a different event being used in a ticket purchase.
 *
 * MUST be called inside a `withTenantSchema` callback.
 * Returns 404 (never 403).
 */
export async function assertEventSectorExists(
  prisma: PrismaClient,
  sectorId: string,
  eventId: string,
): Promise<void> {
  const found = await prisma.eventSector.findFirst({
    where: { id: sectorId, eventId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Setor não encontrado.");
}

export async function assertTicketExists(
  prisma: PrismaClient,
  ticketId: string,
): Promise<void> {
  const found = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Ingresso não encontrado.");
}

export async function assertPosProductExists(
  prisma: PrismaClient,
  productId: string,
): Promise<void> {
  const found = await prisma.posProduct.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Produto não encontrado.");
}

/**
 * Asserts that a ScoutShowcase for the given athleteId belongs to the
 * authenticated club's scope in the PUBLIC schema.
 *
 * No withTenantSchema needed — scout_showcases lives in public schema.
 * Returns 404 (never 403) to avoid confirming cross-tenant resource existence. [SEC-OBJ]
 */
export async function assertShowcaseBelongsToClub(
  prisma: PrismaClient,
  athleteId: string,
  clubId: string,
): Promise<string> {
  const found = await prisma.scoutShowcase.findUnique({
    where: { clubId_athleteId: { clubId, athleteId } },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Showcase não encontrado.");
  return found.id;
}
