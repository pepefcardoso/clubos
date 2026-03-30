"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchMemberCard } from "@/lib/api/member-card";

export const MEMBER_CARD_QUERY_KEY = ["member-card"] as const;

/**
 * Fetches and caches a member's digital card data.
 *
 * Cache strategy:
 *   - staleTime 23h: token is valid for 24h; background-refresh 1h before
 *     expiry so the next time the modal opens the card is fresh.
 *   - gcTime 24h: keeps the last-fetched card in memory even after the modal
 *     closes, enabling instant re-open and offline display via React Query's
 *     in-memory cache (the SW NetworkFirst strategy handles deeper offline).
 *
 * The query is disabled when memberId is null (modal not open).
 *
 * @param memberId - target member ID, or null to disable fetching
 */
export function useMemberCard(memberId: string | null) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...MEMBER_CARD_QUERY_KEY, memberId],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      if (!memberId) throw new Error("memberId obrigatório");
      return fetchMemberCard(memberId, token);
    },
    enabled: !!memberId,
    staleTime: 23 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
