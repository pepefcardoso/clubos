const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface RevenueStatementPeriod {
  /** ISO year-month, e.g. "2025-03" */
  period: string;
  revenueCents: number;
  pendingCents: number;
  overdueCents: number;
  chargeCount: number;
  paymentCount: number;
  expensesCents: number;
  /** revenueCents - expensesCents (may be negative) */
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
  /** ISO YYYY-MM-DD */
  from: string;
  /** ISO YYYY-MM-DD */
  to: string;
  periods: RevenueStatementPeriod[];
  totals: RevenueStatementTotals;
}

/**
 * Discriminated union for the three supported period selection modes.
 * Used as the React Query key so switching mode triggers a fresh fetch.
 */
export type RevenueStatementMode =
  | { type: "months"; months: number }
  | { type: "year"; year: number }
  | { type: "range"; from: string; to: string };

export class RevenueStatementApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RevenueStatementApiError";
  }
}

/**
 * Fetches the integrated revenue statement for the authenticated club.
 *
 * Translates the typed `RevenueStatementMode` into the appropriate query
 * string and forwards the Bearer token.
 */
export async function fetchRevenueStatement(
  mode: RevenueStatementMode,
  accessToken: string,
): Promise<RevenueStatementResponse> {
  const q = new URLSearchParams();

  if (mode.type === "months") {
    q.set("months", String(mode.months));
  } else if (mode.type === "year") {
    q.set("year", String(mode.year));
  } else {
    q.set("from", mode.from);
    q.set("to", mode.to);
  }

  const res = await fetch(
    `${API_BASE}/api/revenue-statement?${q.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new RevenueStatementApiError(
      body.message ?? `Erro ao buscar demonstrativo: ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<RevenueStatementResponse>;
}