"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchInjuryCorrelation,
  fetchAtRiskAthletes,
} from "@/lib/api/workload";

interface UseInjuryCorrelationParams {
  days?: number;
  minAcwr?: number;
  enabled?: boolean;
}

/**
 * Fetches injury events correlated with elevated ACWR (PHYSIO | ADMIN only).
 *
 * staleTime is aligned with the BullMQ ACWR MV refresh interval (4 minutes)
 * so the UI does not hammer the API more frequently than the data changes.
 *
 * The query is enabled by default — callers should pass `enabled: false` when
 * the parent component is not yet visible or the role check has not resolved.
 */
export function useInjuryCorrelation({
  days = 30,
  minAcwr = 1.3,
  enabled = true,
}: UseInjuryCorrelationParams = {}) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: ["injury-correlation", { days, minAcwr }],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchInjuryCorrelation({ days, minAcwr }, token);
    },
    enabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

interface UseAtRiskAthletesParams {
  minAcwr?: number;
  enabled?: boolean;
}

/**
 * Fetches currently at-risk athletes (ACWR >= minAcwr) for proactive
 * injury prevention. Restricted to PHYSIO | ADMIN.
 *
 * Returns an empty athletes array (not an error) when the ACWR MV has not
 * been refreshed yet — callers should render an empty state in this case.
 */
export function useAtRiskAthletes({
  minAcwr = 1.3,
  enabled = true,
}: UseAtRiskAthletesParams = {}) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: ["at-risk-athletes", { minAcwr }],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchAtRiskAthletes({ minAcwr }, token);
    },
    enabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
