"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  createMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
  listMedicalRecords,
  getMedicalRecord,
  downloadMedicalRecordReport,
  type CreateMedicalRecordPayload,
  type UpdateMedicalRecordPayload,
  type ListMedicalRecordsParams,
} from "@/lib/api/medical-records";

export const MEDICAL_RECORDS_QUERY_KEY = ["medical-records"] as const;

/**
 * Fetches a paginated list of medical record summaries for an athlete.
 * Disabled when athleteId is not provided — explicit selection is required.
 *
 * staleTime 5 min — medical records are updated infrequently within a session.
 */
export function useMedicalRecords(params: ListMedicalRecordsParams) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...MEDICAL_RECORDS_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return listMedicalRecords(params, token);
    },
    enabled: !!params.athleteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Fetches the full detail of a single medical record (with decrypted clinical fields).
 * Disabled when recordId is null.
 */
export function useMedicalRecord(recordId: string | null) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...MEDICAL_RECORDS_QUERY_KEY, recordId],
    queryFn: async () => {
      if (!recordId) throw new Error("recordId is required");
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return getMedicalRecord(recordId, token);
    },
    enabled: recordId !== null,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/** Creates a new injury medical record and invalidates the list cache. */
export function useCreateMedicalRecord() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateMedicalRecordPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createMedicalRecord(payload, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEDICAL_RECORDS_QUERY_KEY });
    },
  });
}

/** Partially updates an existing medical record and invalidates the list cache. */
export function useUpdateMedicalRecord() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recordId,
      payload,
    }: {
      recordId: string;
      payload: UpdateMedicalRecordPayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateMedicalRecord(recordId, payload, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEDICAL_RECORDS_QUERY_KEY });
    },
  });
}

/** Hard-deletes a medical record and invalidates the list cache. */
export function useDeleteMedicalRecord() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (recordId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return deleteMedicalRecord(recordId, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEDICAL_RECORDS_QUERY_KEY });
    },
  });
}

/**
 * Returns a mutation that triggers a PDF download for a medical record report.
 *
 * Uses an async mutation pattern (not useQuery) because it triggers a
 * file download rather than rendering data into the UI.
 *
 * The PDF is generated server-side (clinical fields decrypted via pgcrypto)
 * and streamed as a binary response. The browser download is triggered
 * programmatically via a temporary anchor element + `URL.createObjectURL`.
 *
 * Role: ADMIN | PHYSIO only (enforced by the API — same guard as other
 * FisioBase endpoints).
 */
export function useDownloadMedicalRecordReport() {
  const { getAccessToken } = useAuth();

  return useMutation({
    mutationFn: async (recordId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");

      const blob = await downloadMedicalRecordReport(recordId, token);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laudo-lesao-${recordId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
}
