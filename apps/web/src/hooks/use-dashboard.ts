"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchDashboardSummary,
  fetchChargesHistory,
  fetchOverdueMembers,
} from "@/lib/api/dashboard";

export const DASHBOARD_QUERY_KEY = ["dashboard", "summary"] as const;
export const CHARGES_HISTORY_QUERY_KEY = [
  "dashboard",
  "charges-history",
] as const;
export const OVERDUE_MEMBERS_QUERY_KEY = [
  "dashboard",
  "overdue-members",
] as const;

const DASHBOARD_STALE_TIME = 60_000;

export function useDashboardSummary() {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchDashboardSummary(token);
    },
    staleTime: DASHBOARD_STALE_TIME,
  });
}

export function useChargesHistory(months = 6) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...CHARGES_HISTORY_QUERY_KEY, months],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchChargesHistory(token, months);
    },
    staleTime: DASHBOARD_STALE_TIME,
  });
}

/**
 * Fetches paginated overdue members for the dashboard "Sócios Inadimplentes" table.
 * Stale time is 30s — shorter than KPIs since this table drives manual actions.
 */
export function useOverdueMembers(page = 1, limit = 20) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...OVERDUE_MEMBERS_QUERY_KEY, page, limit],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchOverdueMembers(token, page, limit);
    },
    staleTime: 30_000,
  });
}
