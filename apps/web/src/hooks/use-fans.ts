"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchFans, type FetchFansParams } from "@/lib/api/fans";

export const FANS_QUERY_KEY = ["fans"] as const;

export function useFans(params: FetchFansParams = {}) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...FANS_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchFans({ limit: 20, ...params }, token);
    },
  });
}
