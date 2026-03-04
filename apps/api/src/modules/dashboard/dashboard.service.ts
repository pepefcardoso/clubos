import { MonthlyChargeStat } from "@clubos/shared-types";
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

export async function getChargesHistory(
  prisma: PrismaClient,
  clubId: string,
  months = 6,
): Promise<MonthlyChargeStat[]> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const now = new Date();

    const ranges: Array<{ start: Date; end: Date }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
      );
      const end = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - i + 1,
          0,
          23,
          59,
          59,
          999,
        ),
      );
      ranges.push({ start, end });
    }

    const map = new Map<string, MonthlyChargeStat>();
    for (const { start } of ranges) {
      const key = start.toISOString().slice(0, 7);
      map.set(key, {
        month: key,
        paid: 0,
        overdue: 0,
        pending: 0,
        paidAmountCents: 0,
        overdueAmountCents: 0,
      });
    }

    const raw = await tx.$queryRaw<
      Array<{
        month: string;
        status: string;
        count: bigint;
        amount_cents: bigint;
      }>
    >`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "dueDate"), 'YYYY-MM-01') AS month,
        status::text                                           AS status,
        COUNT(*)::bigint                                       AS count,
        COALESCE(SUM("amountCents"), 0)::bigint               AS amount_cents
      FROM charges
      WHERE
        "dueDate" >= ${ranges[0]!.start}
        AND "dueDate" <= ${ranges[ranges.length - 1]!.end}
        AND status IN ('PAID', 'OVERDUE', 'PENDING', 'PENDING_RETRY')
      GROUP BY DATE_TRUNC('month', "dueDate"), status
      ORDER BY DATE_TRUNC('month', "dueDate") ASC
    `;

    for (const row of raw) {
      const key = row.month.slice(0, 7);
      const entry = map.get(key);
      if (!entry) continue;

      const count = Number(row.count);
      const amount = Number(row.amount_cents);

      if (row.status === "PAID") {
        entry.paid += count;
        entry.paidAmountCents += amount;
      } else if (row.status === "OVERDUE") {
        entry.overdue += count;
        entry.overdueAmountCents += amount;
      } else {
        entry.pending += count;
      }
    }

    return Array.from(map.values());
  });
}
