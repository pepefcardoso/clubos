"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  createMember,
  updateMember,
  type CreateMemberPayload,
  type UpdateMemberPayload,
} from "@/lib/api/members";

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
