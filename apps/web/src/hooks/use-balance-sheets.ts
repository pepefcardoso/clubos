"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAdminBalanceSheets,
  uploadBalanceSheet,
} from "@/lib/api/balance-sheets";

export const BALANCE_SHEETS_QUERY_KEY = ["balance-sheets"] as const;

/**
 * Fetches all published balance sheets for the authenticated club.
 * Queries the protected `/api/clubs/:clubId/balance-sheets` endpoint.
 * staleTime of 60s — balance sheets change infrequently.
 */
export function useBalanceSheets() {
  const { getAccessToken, user } = useAuth();

  return useQuery({
    queryKey: [...BALANCE_SHEETS_QUERY_KEY, user?.clubId],
    queryFn: async () => {
      if (!user?.clubId) throw new Error("Clube não identificado");
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchAdminBalanceSheets(user.clubId, token);
    },
    enabled: !!user?.clubId,
    staleTime: 60_000,
  });
}

export interface UploadBalanceSheetPayload {
  file: File;
  title: string;
  period: string;
}

/**
 * Mutation for uploading and publishing a new balance sheet PDF.
 * ADMIN role required — the server enforces this via JWT guard.
 * Invalidates the balance-sheets query on success so the table refreshes.
 */
export function useUploadBalanceSheet() {
  const { getAccessToken, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UploadBalanceSheetPayload) => {
      if (!user?.clubId) throw new Error("Clube não identificado");
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return uploadBalanceSheet(
        user.clubId,
        payload.file,
        payload.title,
        payload.period,
        token,
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: BALANCE_SHEETS_QUERY_KEY }),
  });
}
