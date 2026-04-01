"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchAthleteAcwr } from "@/lib/api/workload";

interface UseAthleteAcwrParams {
  athleteId: string | null;
  days?: number;
  enabled?: boolean;
}

/**
 * Fetches ACWR history for a single athlete.
 *
 * staleTime is set to 4 minutes — aligned with the BullMQ job interval
 * that refreshes the acwr_aggregates materialized view. This avoids
 * redundant network calls while the view is guaranteed unchanged.
 *
 * The query is disabled when `athleteId` is null (no athlete selected).
 */
export function useAthleteAcwr({
  athleteId,
  days = 28,
  enabled = true,
}: UseAthleteAcwrParams) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: ["athlete-acwr", athleteId, days],
    queryFn: async () => {
      if (!athleteId) throw new Error("athleteId is required");
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchAthleteAcwr(athleteId, days, token);
    },
    enabled: enabled && !!athleteId,
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
