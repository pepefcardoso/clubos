"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  createAthlete,
  updateAthlete,
  type CreateAthletePayload,
  type UpdateAthletePayload,
} from "@/lib/api/athletes";

export const ATHLETES_QUERY_KEY = ["athletes"] as const;

export function useCreateAthlete() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateAthletePayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createAthlete(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ATHLETES_QUERY_KEY }),
  });
}

export function useUpdateAthlete() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      athleteId,
      payload,
    }: {
      athleteId: string;
      payload: UpdateAthletePayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateAthlete(athleteId, payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ATHLETES_QUERY_KEY }),
  });
}
