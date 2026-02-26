import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { decryptField } from "../../lib/crypto.js";
import { assertClubHasActivePlan } from "../plans/plans.service.js";
import { GatewayRegistry } from "../payments/gateway.registry.js";
import type { PaymentMethod } from "../payments/gateway.interface.js";
import type {
  GenerateMonthlyChargesInput,
  ChargeGenerationResult,
  GatewayMeta,
} from "./charges.schema.js";

export { NoActivePlanError } from "../plans/plans.service.js";

export class ChargePeriodConflictError extends Error {
  constructor(memberId: string) {
    super(`Member ${memberId} already has a charge for this billing period`);
    this.name = "ChargePeriodConflictError";
  }
}

/**
 * Payment methods that skip the external gateway.
 * Charges created with these methods are confirmed manually by the treasurer.
 */
const OFFLINE_METHODS = new Set<string>(["CASH", "BANK_TRANSFER"]);

/**
 * Discriminated union returned by dispatchChargeToGateway.
 *
 *   - Error path:   { error: string }
 *   - Success path: { externalId, gatewayName, meta }
 *
 * Keeping these distinct lets callers check `'error' in result` without
 * relying on an `undefined` sentinel, which is harder to type-narrow.
 */
export type DispatchResult =
  | { error: string }
  | { externalId: string; gatewayName: string; meta: GatewayMeta };

/**
 * Returns the billing period (year + month) from an optional ISO date string.
 * Defaults to the current UTC month.
 */
export function getBillingPeriod(billingPeriod?: string): {
  year: number;
  month: number;
} {
  const ref = billingPeriod ? new Date(billingPeriod) : new Date();
  return { year: ref.getUTCFullYear(), month: ref.getUTCMonth() + 1 };
}

/**
 * Returns the last moment of the last day of the given month/year (UTC).
 * Used as the default due date for monthly charges.
 *
 * Day 0 of month+1 == last day of month in JavaScript's Date API.
 */
export function getDefaultDueDate(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

/**
 * Returns true if the member already has a non-cancelled charge
 * for the given billing period (any day within that calendar month).
 *
 * This is the idempotency guard — prevents duplicate charges when
 * generateMonthlyCharges() is called more than once in the same month.
 *
 * CANCELLED charges are excluded so a re-run after a manual cancellation
 * correctly generates a new charge for the member.
 */
export async function hasExistingCharge(
  tx: PrismaClient,
  memberId: string,
  year: number,
  month: number,
): Promise<boolean> {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const existing = await tx.charge.findFirst({
    where: {
      memberId,
      status: { notIn: ["CANCELLED"] },
      dueDate: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true },
  });

  return existing !== null;
}

/**
 * Transitions all PENDING charges in the given billing period for a club
 * to PENDING_RETRY status.
 *
 * Called by the charge-generation worker when a job exhausts all retry
 * attempts. Charges in PAID, CANCELLED, OVERDUE or PENDING_RETRY status
 * are left untouched (WHERE clause is scoped to PENDING only).
 *
 * Idempotent: safe to call multiple times for the same period.
 *
 * @param prisma        - Singleton Prisma client (not a transaction).
 * @param clubId        - Tenant identifier.
 * @param billingPeriod - Optional ISO date string; defaults to current UTC month.
 */
export async function markChargesPendingRetry(
  prisma: PrismaClient,
  clubId: string,
  billingPeriod?: string,
): Promise<{ updated: number }> {
  const { year, month } = getBillingPeriod(billingPeriod);
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const result = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.charge.updateMany({
      where: {
        status: "PENDING",
        dueDate: { gte: periodStart, lte: periodEnd },
      },
      data: {
        status: "PENDING_RETRY",
        updatedAt: new Date(),
      },
    });
  });

  return { updated: result.count };
}

/**
 * Dispatches an already-persisted PENDING charge to the appropriate payment
 * gateway and updates the charge row with externalId, gatewayName, and
 * gatewayMeta on success.
 *
 * Design decisions:
 * - Called OUTSIDE the DB transaction that creates the charge row so a long
 *   HTTP call to the gateway never holds a DB connection open.
 * - Gateway failures are logged and swallowed — the charge stays PENDING and
 *   T-024 retry logic handles recovery. Only non-retriable errors (e.g.
 *   decryption failure, programmer error) are re-thrown.
 * - `idempotencyKey: charge.id` is stable across retries. Asaas will return
 *   the existing charge if the same externalReference is re-submitted, which
 *   prevents double-billing.
 * - Offline methods (CASH, BANK_TRANSFER) short-circuit immediately — no
 *   gateway required; the treasurer confirms them manually.
 * - DB update failure after a successful gateway call is caught separately
 *   and returned as an error with full context (externalId included) so
 *   operators can reconcile the orphaned gateway charge via T-024 retry.
 *
 * @param prisma   - Singleton Prisma client (not a transaction).
 * @param clubId   - Tenant identifier used by withTenantSchema.
 * @param charge   - The persisted PENDING Charge row (subset of fields needed).
 * @param member   - Raw Member row with cpf/phone still encrypted as Bytes.
 * @returns        A DispatchResult discriminated union:
 *                   { error } on any failure,
 *                   { externalId, gatewayName, meta } on success.
 */
export async function dispatchChargeToGateway(
  prisma: PrismaClient,
  clubId: string,
  charge: {
    id: string;
    amountCents: number;
    dueDate: Date;
    method: string;
  },
  member: {
    id: string;
    name: string;
    cpf: Uint8Array;
    phone: Uint8Array;
    email: string | null;
  },
): Promise<DispatchResult> {
  if (OFFLINE_METHODS.has(charge.method)) {
    return { externalId: "", gatewayName: "", meta: {} as GatewayMeta };
  }

  const [cpf, phone] = await withTenantSchema(prisma, clubId, async (tx) => {
    return Promise.all([
      decryptField(tx, member.cpf),
      decryptField(tx, member.phone),
    ]);
  });

  let gateway: ReturnType<typeof GatewayRegistry.forMethod>;
  try {
    gateway = GatewayRegistry.forMethod(charge.method as PaymentMethod);
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : "Unknown registry error";
    console.warn(
      `[charges] No gateway for method "${charge.method}" on charge ${charge.id}: ${reason}`,
    );
    return { error: reason };
  }

  let gatewayResult: Awaited<ReturnType<typeof gateway.createCharge>>;
  try {
    gatewayResult = await gateway.createCharge({
      amountCents: charge.amountCents,
      dueDate: charge.dueDate,
      method: charge.method as PaymentMethod,
      customer: {
        name: member.name,
        cpf,
        phone,
        email: member.email ?? undefined,
      },
      description: `Mensalidade ClubOS — ${charge.dueDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`,
      idempotencyKey: charge.id,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown gateway error";
    console.warn(
      `[charges] Gateway dispatch failed for charge ${charge.id}: ${reason}`,
    );
    return { error: reason };
  }

  const meta = gatewayResult.meta as GatewayMeta;

  try {
    await withTenantSchema(prisma, clubId, async (tx) => {
      await tx.charge.update({
        where: { id: charge.id },
        data: {
          externalId: gatewayResult.externalId,
          gatewayName: gateway.name,
          gatewayMeta: meta as Prisma.InputJsonValue,
        },
      });
    });
  } catch (dbErr) {
    const reason =
      dbErr instanceof Error
        ? `DB update failed after gateway success (externalId=${gatewayResult.externalId}): ${dbErr.message}`
        : `DB update failed after gateway success (externalId=${gatewayResult.externalId}): Unknown error`;
    console.error(`[charges] Critical: ${reason}`);
    return { error: reason };
  }

  return {
    externalId: gatewayResult.externalId,
    gatewayName: gateway.name,
    meta,
  };
}

/**
 * Generates monthly charges for all eligible members of a club.
 *
 * Eligible members: status = ACTIVE AND have an active MemberPlan (endedAt IS NULL).
 *
 * Each charge is created in its own independent DB transaction so a single
 * failure does not roll back charges already committed for other members.
 *
 * After committing each charge row, dispatchChargeToGateway() is called to
 * obtain the Pix QR Code and update the charge with externalId / gatewayMeta.
 * Gateway failures are isolated into result.gatewayErrors — they do NOT appear
 * in result.errors and do NOT prevent other charges from being processed.
 *
 * @param prisma   - Singleton Prisma client (not a transaction).
 * @param clubId   - The authenticated club's ID.
 * @param actorId  - The user/job triggering the run (for audit log).
 * @param input    - Optional billing period and due date overrides.
 */
export async function generateMonthlyCharges(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: GenerateMonthlyChargesInput = {},
): Promise<ChargeGenerationResult> {
  await assertClubHasActivePlan(prisma, clubId);

  const { year, month } = getBillingPeriod(input.billingPeriod);
  const dueDate = input.dueDate
    ? new Date(input.dueDate)
    : getDefaultDueDate(year, month);

  const result: ChargeGenerationResult = {
    generated: 0,
    skipped: 0,
    errors: [],
    gatewayErrors: [],
    charges: [],
  };

  const eligibleMembers = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.memberPlan.findMany({
      where: {
        endedAt: null,
        member: { status: "ACTIVE" },
        plan: { isActive: true },
      },
      include: {
        member: { select: { id: true, name: true } },
        plan: { select: { id: true, priceCents: true } },
      },
    });
  });

  if (eligibleMembers.length === 0) {
    return result;
  }

  for (const mp of eligibleMembers) {
    let createdCharge: {
      id: string;
      amountCents: number;
      dueDate: Date;
      method: string;
    } | null;

    try {
      createdCharge = await withTenantSchema(prisma, clubId, async (tx) => {
        const alreadyCharged = await hasExistingCharge(
          tx,
          mp.memberId,
          year,
          month,
        );
        if (alreadyCharged) {
          result.skipped++;
          return null;
        }

        const charge = await tx.charge.create({
          data: {
            memberId: mp.memberId,
            amountCents: mp.plan.priceCents,
            dueDate,
            status: "PENDING",
            method: "PIX",
          },
        });

        await tx.auditLog.create({
          data: {
            memberId: mp.memberId,
            actorId,
            action: "CHARGE_GENERATED",
            entityId: charge.id,
            entityType: "Charge",
            metadata: {
              amountCents: charge.amountCents,
              dueDate: charge.dueDate.toISOString(),
              billingPeriod: `${year}-${String(month).padStart(2, "0")}`,
            },
          },
        });

        result.generated++;
        result.charges.push({
          chargeId: charge.id,
          memberId: mp.memberId,
          memberName: mp.member.name,
          amountCents: charge.amountCents,
          dueDate: charge.dueDate,
        });

        return {
          id: charge.id,
          amountCents: charge.amountCents,
          dueDate: charge.dueDate,
          method: charge.method,
        };
      });
    } catch (err) {
      result.errors.push({
        memberId: mp.memberId,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
      continue;
    }

    if (createdCharge !== null) {
      const memberRow = await withTenantSchema(prisma, clubId, async (tx) => {
        return tx.member.findUnique({ where: { id: mp.memberId } });
      });

      if (memberRow !== null) {
        const dispatchResult = await dispatchChargeToGateway(
          prisma,
          clubId,
          createdCharge,
          memberRow,
        );

        if ("error" in dispatchResult) {
          result.gatewayErrors.push({
            chargeId: createdCharge.id,
            memberId: mp.memberId,
            reason: dispatchResult.error,
          });
        } else if (dispatchResult.externalId) {
          const summary = result.charges.find(
            (c) => c.chargeId === createdCharge!.id,
          );
          if (summary) {
            summary.gatewayMeta = dispatchResult.meta;
            summary.externalId = dispatchResult.externalId;
            summary.gatewayName = dispatchResult.gatewayName;
          }
        }
      }
    }
  }

  return result;
}
