import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";

export interface DashboardSummary {
  members: {
    total: number;
    active: number;
    inactive: number;
    overdue: number;
  };
  charges: {
    pendingCount: number;
    pendingAmountCents: number;
    overdueCount: number;
    overdueAmountCents: number;
  };
  payments: {
    paidThisMonthCount: number;
    paidThisMonthAmountCents: number;
  };
}

export async function getDashboardSummary(
  prisma: PrismaClient,
  clubId: string,
): Promise<DashboardSummary> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const memberGroups = await tx.member.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const memberMap = Object.fromEntries(
      memberGroups.map((g) => [g.status, g._count.id]),
    );

    const chargeGroups = await tx.charge.groupBy({
      by: ["status"],
      where: { status: { in: ["PENDING", "OVERDUE"] } },
      _count: { id: true },
      _sum: { amountCents: true },
    });

    const chargeMap = Object.fromEntries(
      chargeGroups.map((g) => [
        g.status,
        { count: g._count.id, amountCents: g._sum.amountCents ?? 0 },
      ]),
    );

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const paidThisMonth = await tx.payment.aggregate({
      where: {
        paidAt: { gte: startOfMonth, lt: startOfNextMonth },
        cancelledAt: null,
      },
      _count: { id: true },
      _sum: { amountCents: true },
    });

    const totalMembers = memberGroups.reduce((acc, g) => acc + g._count.id, 0);

    return {
      members: {
        total: totalMembers,
        active: memberMap["ACTIVE"] ?? 0,
        inactive: memberMap["INACTIVE"] ?? 0,
        overdue: memberMap["OVERDUE"] ?? 0,
      },
      charges: {
        pendingCount: chargeMap["PENDING"]?.count ?? 0,
        pendingAmountCents: chargeMap["PENDING"]?.amountCents ?? 0,
        overdueCount: chargeMap["OVERDUE"]?.count ?? 0,
        overdueAmountCents: chargeMap["OVERDUE"]?.amountCents ?? 0,
      },
      payments: {
        paidThisMonthCount: paidThisMonth._count.id ?? 0,
        paidThisMonthAmountCents: paidThisMonth._sum.amountCents ?? 0,
      },
    };
  });
}
