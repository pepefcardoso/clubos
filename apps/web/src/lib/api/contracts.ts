import type { PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public error?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ContractType = "PROFESSIONAL" | "AMATEUR" | "FORMATIVE" | "LOAN";
export type ContractStatus = "ACTIVE" | "EXPIRED" | "TERMINATED" | "SUSPENDED";

export interface ContractResponse {
  id: string;
  athleteId: string;
  type: ContractType;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  bidRegistered: boolean;
  federationCode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FetchContractsParams {
  page?: number;
  limit?: number;
  athleteId?: string;
  status?: ContractStatus;
}

export interface CreateContractPayload {
  athleteId: string;
  type: ContractType;
  startDate: string;
  endDate?: string;
  bidRegistered?: boolean;
  federationCode?: string;
  notes?: string;
}

export interface UpdateContractPayload {
  status?: ContractStatus;
  endDate?: string | null;
  bidRegistered?: boolean;
  federationCode?: string | null;
  notes?: string | null;
}

export async function fetchContracts(
  params: FetchContractsParams,
  accessToken: string,
): Promise<PaginatedResponse<ContractResponse>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.athleteId) query.set("athleteId", params.athleteId);
  if (params.status) query.set("status", params.status);

  const res = await fetch(`${API_BASE}/api/contracts?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro ao carregar contratos: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<PaginatedResponse<ContractResponse>>;
}

export async function createContract(
  payload: CreateContractPayload,
  accessToken: string,
): Promise<ContractResponse> {
  const res = await fetch(`${API_BASE}/api/contracts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? "Erro ao cadastrar contrato",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<ContractResponse>;
}

export async function updateContract(
  contractId: string,
  payload: UpdateContractPayload,
  accessToken: string,
): Promise<ContractResponse> {
  const res = await fetch(`${API_BASE}/api/contracts/${contractId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? "Erro ao atualizar contrato",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<ContractResponse>;
}

export async function getContract(
  contractId: string,
  accessToken: string,
): Promise<ContractResponse> {
  const res = await fetch(`${API_BASE}/api/contracts/${contractId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? "Contrato não encontrado",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<ContractResponse>;
}
