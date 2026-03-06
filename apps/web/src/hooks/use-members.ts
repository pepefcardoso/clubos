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
