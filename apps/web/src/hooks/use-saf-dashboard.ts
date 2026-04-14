"use client";

import { useMemo } from "react";
import { useBalanceSheets } from "@/hooks/use-balance-sheets";
import { useCreditorDisclosures } from "@/hooks/use-creditor-disclosures";
import { useRevenueStatement } from "@/hooks/use-revenue-statement";

export type ComplianceStatus =
  | "compliant"
  | "warning"
  | "irregular"
  | "unknown";

/**
 * Pure function — exported for unit testing.
 * Derives SAF compliance status from available data points.
 *
 * @param lastPublishedAt  ISO 8601 string of the most recent balance sheet, or null
 * @param pendingTotalCents  Sum of all PENDING creditor disclosures in cents
 * @param now  Reference date (injectable for tests)
 */
export function deriveComplianceStatus(
  lastPublishedAt: string | null,
  pendingTotalCents: number,
  now: Date = new Date(),
): ComplianceStatus {
  if (lastPublishedAt === null) return "irregular";

  const publishedYear = new Date(lastPublishedAt).getFullYear();
  const currentYear = now.getFullYear();

  if (publishedYear < currentYear) return "irregular";
  if (pendingTotalCents > 0) return "warning";
  return "compliant";
}

export interface SafDashboardData {
  mrrCents: number;
  pendingLiabilitiesCents: number;
  lastPublishedAt: string | null;
  complianceStatus: ComplianceStatus;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Aggregates all SAF KPI data from three independent queries.
 * Each query is independent — one failing does not block the others.
 *
 * React Query's cache deduplication ensures that hooks shared with the
 * individual panels (BalanceSheetsPanel, CreditorDisclosuresPanel,
 * RevenueStatementPanel) result in a single HTTP request per endpoint.
 */
export function useSafDashboard(): SafDashboardData {
  const balanceSheetsQuery = useBalanceSheets();
  const creditorsQuery = useCreditorDisclosures({ page: 1, limit: 1 });
  const revenueQuery = useRevenueStatement({ type: "months", months: 1 });

  const lastPublishedAt = balanceSheetsQuery.data?.data[0]?.publishedAt ?? null;
  const pendingLiabilitiesCents = creditorsQuery.data?.pendingTotalCents ?? 0;

  const complianceStatus = useMemo<ComplianceStatus>(() => {
    if (balanceSheetsQuery.isLoading || creditorsQuery.isLoading) {
      return "unknown";
    }
    return deriveComplianceStatus(lastPublishedAt, pendingLiabilitiesCents);
  }, [
    balanceSheetsQuery.isLoading,
    creditorsQuery.isLoading,
    lastPublishedAt,
    pendingLiabilitiesCents,
  ]);

  return {
    mrrCents: revenueQuery.data?.totals.revenueCents ?? 0,
    pendingLiabilitiesCents,
    lastPublishedAt,
    complianceStatus,
    isLoading:
      balanceSheetsQuery.isLoading ||
      creditorsQuery.isLoading ||
      revenueQuery.isLoading,
    isError:
      balanceSheetsQuery.isError ||
      creditorsQuery.isError ||
      revenueQuery.isError,
  };
}
