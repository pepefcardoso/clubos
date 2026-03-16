"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchCharges,
  generateCharges,
  type FetchChargesParams,
  type GenerateChargesPayload,
} from "@/lib/api/charges";

export const CHARGES_QUERY_KEY = ["charges"] as const;

/**
 * Fetches paginated charges for the authenticated club.
 * Stale time is 30s — short enough to reflect recent generate operations.
 */
export function useCharges(params: FetchChargesParams) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...CHARGES_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchCharges(params, token);
    },
    staleTime: 30_000,
  });
}

/**
 * Triggers monthly charge generation via POST /api/charges/generate.
 * On success, invalidates the charges query so the table auto-refreshes.
 */
export function useGenerateCharges() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: GenerateChargesPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return generateCharges(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHARGES_QUERY_KEY }),
  });
}
