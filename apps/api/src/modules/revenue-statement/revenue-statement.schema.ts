import { z } from "zod";

/**
 * Query params for GET /api/revenue-statement
 *
 * Supported modes:
 *   1. Last N months:   ?months=12         (default)
 *   2. Specific year:   ?year=2025
 *   3. Custom range:    ?from=2025-01-01&to=2025-06-30
 *
 * Modes are mutually exclusive. Validation of mutual exclusivity is
 * performed in the route handler (not here) to produce a cleaner error.
 */
export const RevenueStatementQuerySchema = z.object({
  /** Number of trailing months to include (1–36). */
  months: z.coerce.number().int().min(1).max(36).optional(),
  /** Full calendar year (e.g. 2025). */
  year: z.coerce.number().int().min(2020).max(2099).optional(),
  /** ISO YYYY-MM-DD lower bound. Must be used together with `to`. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")
    .optional(),
  /** ISO YYYY-MM-DD upper bound. Must be used together with `from`. */
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")
    .optional(),
});

export type RevenueStatementQuery = z.infer<typeof RevenueStatementQuerySchema>;

/** One row per calendar month in the selected range. */
export interface RevenueStatementPeriod {
  /** ISO year-month string, e.g. "2025-03" */
  period: string;
  /** Sum of payments.amountCents confirmed in this period */
  revenueCents: number;
  /** Sum of charges.amountCents with status=PENDING and dueDate in period */
  pendingCents: number;
  /** Sum of charges.amountCents with status=OVERDUE and dueDate in period */
  overdueCents: number;
  /** Count of non-CANCELLED charges with dueDate in period */
  chargeCount: number;
  /** Count of payments confirmed in period */
  paymentCount: number;
  /** Sum of expenses.amountCents with date in period */
  expensesCents: number;
  /** revenueCents - expensesCents (can be negative) */
  netCents: number;
}

export interface RevenueStatementTotals {
  revenueCents: number;
  pendingCents: number;
  overdueCents: number;
  expensesCents: number;
  netCents: number;
  paymentCount: number;
  chargeCount: number;
}

export interface RevenueStatementResponse {
  /** ISO YYYY-MM-DD lower bound of the queried range */
  from: string;
  /** ISO YYYY-MM-DD upper bound of the queried range */
  to: string;
  /** Monthly rows ordered newest-first */
  periods: RevenueStatementPeriod[];
  totals: RevenueStatementTotals;
}
