import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { assertClubHasActivePlan } from "../plans/plans.service.js";
import type {
  GenerateMonthlyChargesInput,
  ChargeGenerationResult,
} from "./charges.schema.js";

export { NoActivePlanError } from "../plans/plans.service.js";

export class ChargePeriodConflictError extends Error {
  constructor(memberId: string) {
    super(`Member ${memberId} already has a charge for this billing period`);
    this.name = "ChargePeriodConflictError";
  }
}

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
 * Generates monthly charges for all eligible members of a club.
 *
 * Eligible members: status = ACTIVE AND have an active MemberPlan (endedAt IS NULL).
 *
 * Each charge is created in its own independent transaction so a single failure
 * does not roll back charges already committed for other members.
 *
 * Gateway calls (Asaas, etc.) are intentionally out of scope here — those happen
 * in T-021. This function creates PENDING Charge rows with gatewayName = null
 * and externalId = null; T-021 picks them up and updates those fields.
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
    try {
      await withTenantSchema(prisma, clubId, async (tx) => {
        const alreadyCharged = await hasExistingCharge(
          tx,
          mp.memberId,
          year,
          month,
        );
        if (alreadyCharged) {
          result.skipped++;
          return;
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
      });
    } catch (err) {
      result.errors.push({
        memberId: mp.memberId,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}
