"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchRevenueStatement,
  type RevenueStatementMode,
} from "@/lib/api/revenue-statement";

export const REVENUE_STATEMENT_QUERY_KEY = ["revenue-statement"] as const;

/**
 * Fetches the integrated revenue statement for the authenticated club.
 *
 * The `mode` object is spread into the query key so that switching period
 * presets (e.g. "12m" → "ytd") immediately triggers a fresh network request
 * rather than serving a stale cached result.
 *
 * staleTime of 60s — monthly aggregates change less frequently than
 * individual charge or expense records. Consistent with the financial
 * data pattern used across the SAF module.
 */
export function useRevenueStatement(mode: RevenueStatementMode) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...REVENUE_STATEMENT_QUERY_KEY, mode],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchRevenueStatement(mode, token);
    },
    staleTime: 60_000,
  });
}