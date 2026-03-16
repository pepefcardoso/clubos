"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchContracts,
  createContract,
  updateContract,
  type FetchContractsParams,
  type CreateContractPayload,
  type UpdateContractPayload,
} from "@/lib/api/contracts";

export const CONTRACTS_QUERY_KEY = ["contracts"] as const;

export function useContracts(params: FetchContractsParams) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: [...CONTRACTS_QUERY_KEY, params],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return fetchContracts(params, token);
    },
    staleTime: 30_000,
  });
}

export function useCreateContract() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateContractPayload) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return createContract(payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRACTS_QUERY_KEY }),
  });
}

export function useUpdateContract() {
  const { getAccessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contractId,
      payload,
    }: {
      contractId: string;
      payload: UpdateContractPayload;
    }) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Não autenticado");
      return updateContract(contractId, payload, token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTRACTS_QUERY_KEY }),
  });
}
