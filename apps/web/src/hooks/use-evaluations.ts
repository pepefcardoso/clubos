"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchEvaluations,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
  type CreateEvaluationPayload,
  type UpdateEvaluationPayload,
  type ListEvaluationsParams,
} from "@/lib/api/evaluations";

export const EVALUATIONS_QUERY_KEY = ["evaluations"] as const;

/**
 * Fetches evaluations matching the given filters.
 * The query is disabled when no athleteId is provided — an explicit athlete
 * selection is required to avoid loading all evaluations on the training page.
 *
 * staleTime 5 min is sufficient here since evaluations are infrequently updated
 * (weekly per athlete) and do not need near-real-time freshness.
 */
export function useEvaluations(params: ListEvaluationsParams) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...EVALUATIONS_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchEvaluations(params, token);
    },
    enabled: !!params.athleteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/** Creates a new evaluation and invalidates the evaluations query cache. */
export function useCreateEvaluation() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateEvaluationPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createEvaluation(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVALUATIONS_QUERY_KEY }),
  });
}

/** Updates an existing evaluation and invalidates the evaluations query cache. */
export function useUpdateEvaluation() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateEvaluationPayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateEvaluation(id, payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVALUATIONS_QUERY_KEY }),
  });
}

/** Deletes an evaluation and invalidates the evaluations query cache. */
export function useDeleteEvaluation() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (evaluationId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return deleteEvaluation(evaluationId, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EVALUATIONS_QUERY_KEY }),
  });
}
