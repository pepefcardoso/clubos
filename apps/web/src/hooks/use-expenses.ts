"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  type FetchExpensesParams,
  type CreateExpensePayload,
  type UpdateExpensePayload,
} from "@/lib/api/expenses";

export const EXPENSES_QUERY_KEY = ["expenses"] as const;

/**
 * Fetches paginated expenses for the authenticated club.
 * Stale time of 30s matches the charges hook pattern.
 */
export function useExpenses(params: FetchExpensesParams) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...EXPENSES_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchExpenses(params, token);
    },
    staleTime: 30_000,
  });
}

export function useCreateExpense() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateExpensePayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createExpense(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY }),
  });
}

export function useUpdateExpense() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      expenseId,
      payload,
    }: {
      expenseId: string;
      payload: UpdateExpensePayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateExpense(expenseId, payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY }),
  });
}

export function useDeleteExpense() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (expenseId: string) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return deleteExpense(expenseId, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: EXPENSES_QUERY_KEY }),
  });
}
