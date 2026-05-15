"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchClubContactRequests,
  respondContactRequest,
} from "@/lib/api/club-contact-requests";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export const CLUB_CONTACT_REQUESTS_QUERY_KEY = [
  "club",
  "contact-requests",
] as const;

export function useClubContactRequests() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    void getAccessToken().then((token) => {
      if (!token || cancelled) return;
      es = new EventSource(
        `${API_BASE}/api/events?token=${encodeURIComponent(token)}`,
      );
      es.addEventListener("CONTACT_REQUEST_RECEIVED", () => {
        void qc.invalidateQueries({
          queryKey: CLUB_CONTACT_REQUESTS_QUERY_KEY,
        });
      });
    });

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [getAccessToken, qc]);

  return useQuery({
    queryKey: CLUB_CONTACT_REQUESTS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchClubContactRequests(token);
    },
    staleTime: 30_000,
  });
}

export function useRespondContactRequest() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "ACCEPT" | "REJECT";
      reason?: string;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return respondContactRequest(token, id, action, reason);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: CLUB_CONTACT_REQUESTS_QUERY_KEY }),
  });
}
