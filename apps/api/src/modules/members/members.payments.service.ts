import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";

export interface MemberPaymentItem {
  paymentId: string;
  chargeId: string;
  paidAt: Date;
  method: string;
  amountCents: number;
  gatewayTxid: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  charge: {
    id: string;
    dueDate: Date;
    status: string;
    method: string;
    amountCents: number;
    gatewayName: string | null;
    createdAt: Date;
  };
}

export interface MemberPaymentsResult {
  data: MemberPaymentItem[];
  meta: { total: number; page: number; limit: number };
}

/**
 * Returns paginated payment history for a single member.
 *
 * The caller is responsible for asserting that `memberId` belongs to the
 * authenticated club before calling this function (IDOR guard).
 *
 * Runs inside withTenantSchema so the search_path is correctly scoped to
 * `clube_{clubId}` before any Prisma query executes.
 *
 * Both `payment.method` (what was actually paid) and `charge.method` (what
 * was originally requested) are returned so the frontend can detect any
 * discrepancy — e.g. a PIX charge confirmed manually as CASH.
 *
 * Cancelled payments (cancelledAt non-null) are included in results. The
 * caller / frontend is responsible for filtering display-side.
 *
 * `Charge.gatewayMeta` is intentionally excluded — QR codes are time-limited,
 * can exceed 3 KB, and the payment history view is audit-only, not a
 * re-issuance surface.
 */
export async function getMemberPaymentHistory(
  prisma: PrismaClient,
  clubId: string,
  memberId: string,
  page: number,
  limit: number,
): Promise<MemberPaymentsResult> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = { charge: { memberId } };

    const [payments, total] = await Promise.all([
      tx.payment.findMany({
        where,
        include: {
          charge: {
            select: {
              id: true,
              dueDate: true,
              status: true,
              method: true,
              amountCents: true,
              gatewayName: true,
              createdAt: true,
            },
          },
        },
        orderBy: { paidAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.payment.count({ where }),
    ]);

    const data: MemberPaymentItem[] = payments.map((p) => ({
      paymentId: p.id,
      chargeId: p.chargeId,
      paidAt: p.paidAt,
      method: p.method,
      amountCents: p.amountCents,
      gatewayTxid: p.gatewayTxid,
      cancelledAt: p.cancelledAt ?? null,
      cancelReason: p.cancelReason ?? null,
      charge: {
        id: p.charge.id,
        dueDate: p.charge.dueDate,
        status: p.charge.status,
        method: p.charge.method,
        amountCents: p.charge.amountCents,
        gatewayName: p.charge.gatewayName ?? null,
        createdAt: p.charge.createdAt,
      },
    }));

    return { data, meta: { total, page, limit } };
  });
}

/**
 * Verifies that a member exists in the authenticated club's tenant schema.
 * Returns the member id on success; null if not found.
 *
 * Used by the route handler as the IDOR guard — the route must return 404
 * when null, regardless of whether the member exists in another tenant.
 * This prevents cross-tenant resource existence disclosure.
 */
export async function findMemberInClub(
  prisma: PrismaClient,
  clubId: string,
  memberId: string,
): Promise<{ id: string } | null> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    return tx.member.findUnique({
      where: { id: memberId },
      select: { id: true },
    });
  });
}
