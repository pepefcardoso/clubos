import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { decryptField } from "../../lib/crypto.js";
import { assertClubHasActivePlan } from "../plans/plans.service.js";
import { GatewayRegistry } from "../payments/gateway.registry.js";
import { createChargeWithFallback } from "../payments/gateway-fallback.js";
import type { PaymentMethod } from "../payments/gateway.interface.js";
import {
  notifyClubStaticPixFallback,
  type StaticPixFallbackCharge,
} from "../notifications/club-notifications.service.js";
import type {
  GenerateMonthlyChargesInput,
  ChargeGenerationResult,
  GatewayMeta,
} from "./charges.schema.js";
import { ConflictError } from "../../lib/errors.js";

export { NoActivePlanError } from "../plans/plans.service.js";

export class ChargePeriodConflictError extends ConflictError {
  constructor(memberId: string) {
    super(`Member ${memberId} already has a charge for this billing period`);
  }
}

/**
 * Payment methods that skip the external gateway entirely.
 * Charges created with these methods are confirmed manually by the treasurer.
 */
const OFFLINE_METHODS = new Set<string>(["CASH", "BANK_TRANSFER"]);

/**
 * Discriminated union returned by dispatchChargeToGateway.
 *
 *   - Error path:   { error: string }
 *   - Success path: { externalId, gatewayName, meta, isStaticFallback }
 *
 * Keeping these distinct lets callers check `'error' in result` without
 * relying on an `undefined` sentinel, which is harder to type-narrow.
 */
export type DispatchResult =
  | { error: string }
  | {
      externalId: string | null;
      gatewayName: string | null;
      meta: GatewayMeta;
      /**
       * True when all registered gateways failed and the club's static PIX key
       * was used as a last resort. The charge has no externalId.
       * Callers use this flag to trigger the admin notification.
       */
      isStaticFallback: boolean;
    };

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
 * Dispatches an already-persisted PENDING charge through the gateway fallback
 * chain and updates the charge row with
 * the resolved externalId, gatewayName, and gatewayMeta on success.
 *
 * Design decisions:
 * - Called OUTSIDE the DB transaction that creates the charge row so a long
 *   HTTP call to the gateway never holds a DB connection open.
 * - Uses GatewayRegistry.listForMethod() + createChargeWithFallback() so the
 *   full fallback chain is tried before the static PIX path.
 * - Gateway failures are logged and swallowed — the charge stays PENDING and
 *   retry logic handles recovery. Only non-retriable errors (e.g.
 *   decryption failure, programmer error) are re-thrown.
 * - `idempotencyKey: charge.id` is stable across retries. Each gateway will
 *   return the existing charge if the same idempotencyKey is re-submitted,
 *   which prevents double-billing.
 * - Offline methods (CASH, BANK_TRANSFER) short-circuit immediately — no
 *   gateway required; the treasurer confirms them manually.
 * - DB update failure after a successful gateway call is caught separately
 *   and returned as an error with full context so operators can reconcile.
 * - Static PIX result (isStaticFallback=true) is persisted with
 *   gatewayName=null and externalId=null — same path as offline methods.
 *
 * @param prisma         - Singleton Prisma client (not a transaction).
 * @param clubId         - Tenant identifier used by withTenantSchema.
 * @param charge         - The persisted PENDING Charge row (subset of fields).
 * @param member         - Raw Member row with cpf/phone still encrypted as Bytes.
 * @param pixKeyFallback - Club's static Pix key for last-resort fallback.
 * @returns              A DispatchResult discriminated union:
 *                         { error } on any failure,
 *                         { externalId, gatewayName, meta, isStaticFallback } on success.
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
  pixKeyFallback: string | null = null,
): Promise<DispatchResult> {
  if (OFFLINE_METHODS.has(charge.method)) {
    return {
      externalId: "",
      gatewayName: "",
      meta: {} as GatewayMeta,
      isStaticFallback: false,
    };
  }

  const [cpf, phone] = await withTenantSchema(prisma, clubId, async (tx) => {
    return Promise.all([
      decryptField(tx, member.cpf),
      decryptField(tx, member.phone),
    ]);
  });

  const gateways = GatewayRegistry.listForMethod(
    charge.method as PaymentMethod,
  );

  let fallbackResult: Awaited<ReturnType<typeof createChargeWithFallback>>;
  try {
    fallbackResult = await createChargeWithFallback(
      gateways,
      {
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
      },
      { pixKeyFallback },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown gateway error";
    console.warn(
      `[charges] All gateways exhausted for charge ${charge.id} (member ${member.id}): ${reason}`,
    );
    return { error: reason };
  }

  if (fallbackResult.attemptErrors.length > 0) {
    console.warn(
      `[charges] Gateway fallback triggered for charge ${charge.id} (club ${clubId}):`,
      fallbackResult.attemptErrors
        .map((e) => `${e.gatewayName}: ${e.error}`)
        .join("; "),
    );
  }

  const meta = fallbackResult.meta as GatewayMeta;

  try {
    await withTenantSchema(prisma, clubId, async (tx) => {
      await tx.charge.update({
        where: { id: charge.id },
        data: {
          externalId: fallbackResult.isStaticFallback
            ? null
            : fallbackResult.externalId || null,
          gatewayName: fallbackResult.resolvedGatewayName,
          gatewayMeta: meta as Prisma.InputJsonValue,
        },
      });
    });
  } catch (dbErr) {
    const externalId = fallbackResult.isStaticFallback
      ? "static-pix"
      : fallbackResult.externalId;
    const reason =
      dbErr instanceof Error
        ? `DB update failed after gateway success (externalId=${externalId}): ${dbErr.message}`
        : `DB update failed after gateway success (externalId=${externalId}): Unknown error`;
    console.error(`[charges] Critical: ${reason}`);
    return { error: reason };
  }

  return {
    externalId: fallbackResult.isStaticFallback
      ? null
      : fallbackResult.externalId || null,
    gatewayName: fallbackResult.resolvedGatewayName,
    meta,
    isStaticFallback: fallbackResult.isStaticFallback,
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
 * The dispatch uses the full fallback chain: Asaas → Pagarme → static PIX.
 * Gateway failures are isolated into result.gatewayErrors — they do
 * NOT appear in result.errors and do NOT prevent other charges from being
 * processed.
 *
 * When one or more charges resolve via the static PIX fallback, a batch
 * summary email is sent to all ADMIN users of the club. This
 * notification is fire-and-forget — delivery failure never affects the
 * HTTP response or job result.
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

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, pixKeyFallback: true },
  });
  const pixKeyFallback = club?.pixKeyFallback ?? null;

  const result: ChargeGenerationResult = {
    generated: 0,
    skipped: 0,
    errors: [],
    gatewayErrors: [],
    charges: [],
    staticPixFallbackCount: 0,
  };

  const staticFallbackCharges: StaticPixFallbackCharge[] = [];

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
          {
            id: mp.memberId,
            name: mp.member.name,
            cpf: Buffer.from(memberRow.cpf),
            phone: Buffer.from(memberRow.phone),
            email: memberRow.email,
          },
          pixKeyFallback,
        );

        if ("error" in dispatchResult) {
          result.gatewayErrors.push({
            chargeId: createdCharge.id,
            memberId: mp.memberId,
            reason: dispatchResult.error,
          });
        } else {
          const summary = result.charges.find(
            (c) => c.chargeId === createdCharge!.id,
          );
          if (summary) {
            summary.gatewayMeta = dispatchResult.meta;
            summary.isStaticFallback = dispatchResult.isStaticFallback;
            if (dispatchResult.externalId != null) {
              summary.externalId = dispatchResult.externalId;
            }
            if (dispatchResult.gatewayName != null) {
              summary.gatewayName = dispatchResult.gatewayName;
            }
          }

          if (dispatchResult.isStaticFallback && pixKeyFallback !== null) {
            staticFallbackCharges.push({
              chargeId: createdCharge.id,
              memberId: mp.memberId,
              memberName: mp.member.name,
              amountCents: createdCharge.amountCents,
              dueDate: createdCharge.dueDate,
              staticPixKey: pixKeyFallback,
            });
            if (summary) {
              summary.staticPixKey = pixKeyFallback;
            }
          }
        }
      }
    }
  }

  result.staticPixFallbackCount = staticFallbackCharges.length;

  if (staticFallbackCharges.length > 0) {
    notifyClubStaticPixFallback(prisma, clubId, staticFallbackCharges).catch(
      (err: unknown) => {
        console.error(
          "[charges] Failed to send static PIX fallback notification:",
          err instanceof Error ? err.message : err,
        );
      },
    );
  }

  return result;
}
