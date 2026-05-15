"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useScoutAuthContext } from "@/contexts/scout-auth.context";
import { fetchScoutContactRequests } from "@/lib/api/contact-requests";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const CONTACT_REQUESTS_QUERY_KEY = [
  "scout",
  "contact-requests",
] as const;

export function useScoutContactRequests() {
  const { getAccessToken } = useScoutAuthContext();
  const qc = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    void getAccessToken().then((token) => {
      if (!token || cancelled) return;
      es = new EventSource(
        `${API_BASE}/api/scout/events?token=${encodeURIComponent(token)}`,
      );
      es.addEventListener("CONTACT_REQUEST_RECEIVED", () => {
        void qc.invalidateQueries({ queryKey: CONTACT_REQUESTS_QUERY_KEY });
      });
    });

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [getAccessToken, qc]);

  return useQuery({
    queryKey: CONTACT_REQUESTS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchScoutContactRequests(token);
    },
    staleTime: 30_000,
  });
}
