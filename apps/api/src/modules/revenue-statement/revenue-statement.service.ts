import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import type {
  RevenueStatementQuery,
  RevenueStatementPeriod,
  RevenueStatementTotals,
  RevenueStatementResponse,
} from "./revenue-statement.schema.js";

/** Raw row returned by the CTE aggregate query. PostgreSQL SUM → bigint. */
interface RawStatementRow {
  period: Date;
  revenue_cents: bigint;
  pending_cents: bigint;
  overdue_cents: bigint;
  charge_count: bigint;
  payment_count: bigint;
  expenses_cents: bigint;
  net_cents: bigint;
}

/**
 * Resolves the [fromDate, toDate] UTC range from query params.
 *
 * Priority order:
 *   1. months  — trailing N calendar months ending at end of current month
 *   2. year    — full calendar year (Jan 1 → Dec 31)
 *   3. from+to — explicit date range (inclusive, both sides)
 *   4. default — trailing 12 months (same as months=12)
 *
 * Exported for unit testing. Pure function: no I/O.
 *
 * @param query - Validated RevenueStatementQuery params.
 * @param now   - Reference "current" date. Defaults to new Date(). Injectable for tests.
 */
export function resolveDateRange(
  query: RevenueStatementQuery,
  now: Date = new Date(),
): { fromDate: Date; toDate: Date } {
  if (query.months !== undefined) {
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const fromDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (query.months - 1), 1),
    );
    return { fromDate, toDate };
  }

  if (query.year !== undefined) {
    return {
      fromDate: new Date(Date.UTC(query.year, 0, 1)),
      toDate: new Date(Date.UTC(query.year, 11, 31, 23, 59, 59, 999)),
    };
  }

  if (query.from !== undefined && query.to !== undefined) {
    return {
      fromDate: new Date(`${query.from}T00:00:00.000Z`),
      toDate: new Date(`${query.to}T23:59:59.999Z`),
    };
  }

  return resolveDateRange({ months: 12 }, now);
}

/**
 * Returns the integrated revenue statement aggregated by calendar month.
 *
 * Four CTEs inside the tenant schema:
 *   revenue       — payments confirmed in range grouped by paidAt month
 *   charge_stats  — pending + overdue charges grouped by dueDate month
 *   expense_stats — expenses grouped by date month
 *   all_periods   — UNION of all appearing months (ensures zero-rows for
 *                   months with activity in only one or two sources)
 *
 * All SUM() calls return PostgreSQL bigint. Converted to JS Number before
 * returning — JSON.stringify throws for bigint values.
 *
 * @param prisma  - Singleton PrismaClient (not a transaction).
 * @param clubId  - Tenant identifier used by withTenantSchema.
 * @param query   - Validated query params (period selection).
 */
export async function getRevenueStatement(
  prisma: PrismaClient,
  clubId: string,
  query: RevenueStatementQuery,
): Promise<RevenueStatementResponse> {
  const { fromDate, toDate } = resolveDateRange(query);

  const rows = await withTenantSchema(prisma, clubId, async (tx) => {
    return (
      tx as unknown as {
        $queryRaw: <T>(
          sql: TemplateStringsArray,
          ...values: unknown[]
        ) => Promise<T>;
      }
    ).$queryRaw<RawStatementRow[]>`
      WITH revenue AS (
        SELECT
          date_trunc('month', p."paidAt")              AS period,
          COALESCE(SUM(p."amountCents"), 0)            AS revenue_cents,
          COUNT(p.id)                                  AS payment_count
        FROM payments p
        WHERE p."paidAt" >= ${fromDate}
          AND p."paidAt" <= ${toDate}
        GROUP BY 1
      ),
      charge_stats AS (
        SELECT
          date_trunc('month', c."dueDate")                                               AS period,
          COALESCE(SUM(c."amountCents") FILTER (WHERE c.status = 'PENDING'),  0)        AS pending_cents,
          COALESCE(SUM(c."amountCents") FILTER (WHERE c.status = 'OVERDUE'),  0)        AS overdue_cents,
          COUNT(c.id) FILTER (WHERE c.status <> 'CANCELLED')                            AS charge_count
        FROM charges c
        WHERE c."dueDate" >= ${fromDate}
          AND c."dueDate" <= ${toDate}
        GROUP BY 1
      ),
      expense_stats AS (
        SELECT
          date_trunc('month', e.date)                  AS period,
          COALESCE(SUM(e."amountCents"), 0)            AS expenses_cents
        FROM expenses e
        WHERE e.date >= ${fromDate}::date
          AND e.date <= ${toDate}::date
        GROUP BY 1
      ),
      all_periods AS (
        SELECT period FROM revenue
        UNION
        SELECT period FROM charge_stats
        UNION
        SELECT period FROM expense_stats
      )
      SELECT
        ap.period,
        COALESCE(r.revenue_cents,   0)  AS revenue_cents,
        COALESCE(cs.pending_cents,  0)  AS pending_cents,
        COALESCE(cs.overdue_cents,  0)  AS overdue_cents,
        COALESCE(cs.charge_count,   0)  AS charge_count,
        COALESCE(r.payment_count,   0)  AS payment_count,
        COALESCE(es.expenses_cents, 0)  AS expenses_cents,
        COALESCE(r.revenue_cents, 0) - COALESCE(es.expenses_cents, 0)  AS net_cents
      FROM all_periods ap
      LEFT JOIN revenue        r  ON r.period  = ap.period
      LEFT JOIN charge_stats   cs ON cs.period = ap.period
      LEFT JOIN expense_stats  es ON es.period = ap.period
      ORDER BY ap.period DESC
    `;
  });

  const periods: RevenueStatementPeriod[] = rows.map((row) => ({
    period: row.period.toISOString().slice(0, 7),
    revenueCents: Number(row.revenue_cents),
    pendingCents: Number(row.pending_cents),
    overdueCents: Number(row.overdue_cents),
    chargeCount: Number(row.charge_count),
    paymentCount: Number(row.payment_count),
    expensesCents: Number(row.expenses_cents),
    netCents: Number(row.net_cents),
  }));

  const totals: RevenueStatementTotals = periods.reduce<RevenueStatementTotals>(
    (acc, p) => ({
      revenueCents: acc.revenueCents + p.revenueCents,
      pendingCents: acc.pendingCents + p.pendingCents,
      overdueCents: acc.overdueCents + p.overdueCents,
      expensesCents: acc.expensesCents + p.expensesCents,
      netCents: acc.netCents + p.netCents,
      paymentCount: acc.paymentCount + p.paymentCount,
      chargeCount: acc.chargeCount + p.chargeCount,
    }),
    {
      revenueCents: 0,
      pendingCents: 0,
      overdueCents: 0,
      expensesCents: 0,
      netCents: 0,
      paymentCount: 0,
      chargeCount: 0,
    },
  );

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
    periods,
    totals,
  };
}
