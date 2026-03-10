import type { PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type AthleteStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface AthleteResponse {
  id: string;
  name: string;
  cpf: string;
  birthDate: string;
  position: string | null;
  status: AthleteStatus;
  createdAt: string;
}

export interface FetchAthletesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: AthleteStatus;
}

export interface CreateAthletePayload {
  name: string;
  cpf: string;
  birthDate: string;
  position?: string;
}

export interface UpdateAthletePayload {
  name?: string;
  birthDate?: string;
  position?: string | null;
  status?: AthleteStatus;
}

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

export async function fetchAthletes(
  params: FetchAthletesParams,
  accessToken: string,
): Promise<PaginatedResponse<AthleteResponse>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search && params.search.trim() !== "")
    query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);

  const res = await fetch(`${API_BASE}/api/athletes?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Failed to fetch athletes: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<PaginatedResponse<AthleteResponse>>;
}

export async function createAthlete(
  payload: CreateAthletePayload,
  accessToken: string,
): Promise<AthleteResponse> {
  const res = await fetch(`${API_BASE}/api/athletes`, {
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
      body.message ?? "Erro ao cadastrar atleta",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<AthleteResponse>;
}

export async function updateAthlete(
  athleteId: string,
  payload: UpdateAthletePayload,
  accessToken: string,
): Promise<AthleteResponse> {
  const res = await fetch(`${API_BASE}/api/athletes/${athleteId}`, {
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
      body.message ?? "Erro ao atualizar atleta",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<AthleteResponse>;
}

export async function getAthlete(
  athleteId: string,
  accessToken: string,
): Promise<AthleteResponse> {
  const res = await fetch(`${API_BASE}/api/athletes/${athleteId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? "Atleta não encontrado",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<AthleteResponse>;
}
