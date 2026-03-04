"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchDashboardSummary } from "@/lib/api/dashboard";

export const DASHBOARD_QUERY_KEY = ["dashboard", "summary"] as const;

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
