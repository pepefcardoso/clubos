"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchDashboardSummary,
  fetchChargesHistory,
} from "@/lib/api/dashboard";

export const DASHBOARD_QUERY_KEY = ["dashboard", "summary"] as const;
export const CHARGES_HISTORY_QUERY_KEY = [
  "dashboard",
  "charges-history",
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
