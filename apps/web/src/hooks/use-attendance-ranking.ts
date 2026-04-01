"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchAttendanceRanking } from "@/lib/api/workload";

interface UseAttendanceRankingParams {
  days?: number;
  sessionType?: string;
  enabled?: boolean;
}

export function useAttendanceRanking({
  days = 30,
  sessionType,
  enabled = true,
}: UseAttendanceRankingParams = {}) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: ["attendance-ranking", { days, sessionType }],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchAttendanceRanking({ days, sessionType }, token);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
