"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  createMember,
  updateMember,
  type CreateMemberPayload,
  type UpdateMemberPayload,
} from "@/lib/api/members";
import { remindMember } from "@/lib/api/dashboard";
import { OVERDUE_MEMBERS_QUERY_KEY } from "@/hooks/use-dashboard";
import {
  importMembersCsv,
  type ImportSuccessResponse,
} from "@/lib/api/members-import";

export const MEMBERS_QUERY_KEY = ["members"] as const;

export function useCreateMember() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateMemberPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createMember(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY }),
  });
}

export function useUpdateMember() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      payload,
    }: {
      memberId: string;
      payload: UpdateMemberPayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateMember(memberId, payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY }),
  });
}

/**
 * Triggers an on-demand WhatsApp reminder for an overdue member.
 *
 * On success, invalidates the overdue-members query so the table refreshes
 * and the UI reflects the latest send state on the next poll.
 *
 * Callers are responsible for handling ApiError (especially status 429)
 * to surface human-readable messages per row rather than a global toast.
 */
export function useRemindMember() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return remindMember(token, memberId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OVERDUE_MEMBERS_QUERY_KEY });
    },
  });
}

/**
 * Uploads a CSV file and bulk-imports members.
 *
 * On success (including partial success with row-level errors), invalidates
 * the members query so any newly created/updated members appear immediately.
 *
 * A 200 response may still contain errors[] — callers must inspect the result
 * to distinguish a clean import from a partial one.
 */
export function useImportMembers() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<ImportSuccessResponse, Error, File>({
    mutationFn: async (file: File) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return importMembersCsv(file, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY });
    },
  });
}
