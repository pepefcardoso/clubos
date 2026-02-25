"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchPlans,
  createPlan,
  updatePlan,
  deletePlan,
  type CreatePlanPayload,
  type UpdatePlanPayload,
} from "@/lib/api/plans";

export const PLANS_QUERY_KEY = ["plans"] as const;

export function usePlans() {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchPlans(token);
    },
  });
}

export function useCreatePlan() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreatePlanPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createPlan(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_QUERY_KEY }),
  });
}

export function useUpdatePlan() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      planId,
      payload,
    }: {
      planId: string;
      payload: UpdatePlanPayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updatePlan(planId, payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_QUERY_KEY }),
  });
}

export function useDeletePlan() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (planId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return deletePlan(planId, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_QUERY_KEY }),
  });
}
