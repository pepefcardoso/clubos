"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ShowcaseTier } from "../../../../packages/shared-types/src/index.js";
import { useAuth } from "@/hooks/use-auth";
import { fetchShowcase, publishShowcase } from "@/lib/api/showcases";

export const SHOWCASE_QUERY_KEY = (athleteId: string) =>
  ["showcase", athleteId] as const;

export function useShowcase(athleteId: string) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: SHOWCASE_QUERY_KEY(athleteId),
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchShowcase(athleteId, token);
    },
    staleTime: 60_000,
  });
}

export function usePublishShowcase(athleteId: string) {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (tier: ShowcaseTier) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return publishShowcase(athleteId, tier, token);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: SHOWCASE_QUERY_KEY(athleteId) }),
  });
}
