"use client";

import { useQuery } from "@tanstack/react-query";
import { useScoutAuthContext } from "@/contexts/scout-auth.context";
import {
  fetchAthleteProfile,
  fetchScoutAthletes,
  type ScoutSearchParams,
} from "@/lib/api/scout-search";

export const SCOUT_SEARCH_QUERY_KEY = (params: ScoutSearchParams) =>
  ["scout-athletes", params] as const;

export function useScoutSearch(params: ScoutSearchParams) {
  const { getAccessToken } = useScoutAuthContext();

  return useQuery({
    queryKey: SCOUT_SEARCH_QUERY_KEY(params),
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchScoutAthletes(params, token);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useAthleteProfile(showcaseId: string) {
  const { getAccessToken } = useScoutAuthContext();

  return useQuery({
    queryKey: ["scout", "athlete-profile", showcaseId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Unauthenticated");
      return fetchAthleteProfile(showcaseId, token);
    },
    enabled: Boolean(showcaseId),
    staleTime: 60_000,
  });
}
