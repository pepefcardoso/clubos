"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchCreditorDisclosures,
  createCreditorDisclosure,
  updateCreditorStatus,
  exportCreditorDisclosuresPdf,
  type FetchCreditorDisclosuresParams,
  type CreateCreditorDisclosurePayload,
} from "@/lib/api/creditor-disclosures";

export const CREDITOR_DISCLOSURES_QUERY_KEY = ["creditor-disclosures"] as const;

/**
 * Fetches paginated creditor disclosures for the authenticated club.
 * staleTime of 30s is consistent with other financial data hooks.
 */
export function useCreditorDisclosures(params: FetchCreditorDisclosuresParams) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...CREDITOR_DISCLOSURES_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchCreditorDisclosures(params, token);
    },
    staleTime: 30_000,
  });
}

export function useCreateCreditorDisclosure() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCreditorDisclosurePayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createCreditorDisclosure(payload, token);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: CREDITOR_DISCLOSURES_QUERY_KEY }),
  });
}

export function useUpdateCreditorStatus() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "SETTLED" | "DISPUTED";
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateCreditorStatus(id, status, token);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: CREDITOR_DISCLOSURES_QUERY_KEY }),
  });
}

/**
 * Mutation that generates the PDF export and triggers a browser file download.
 * Returns { hash, recordCount } on success so the caller can surface the hash
 * in a toast for the user to record as tamper-evidence.
 */
export function useExportCreditorPdf() {
  const { getAccessToken } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");

      const { blob, hash, recordCount } =
        await exportCreditorDisclosuresPdf(token);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `passivos-trabalhistas-${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return { hash, recordCount };
    },
  });
}
