const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface PlanResponse {
  id: string;
  name: string;
  priceCents: number;
  interval: "monthly" | "quarterly" | "annual";
  benefits: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanPayload {
  name: string;
  priceCents: number;
  interval: "monthly" | "quarterly" | "annual";
  benefits: string[];
}

export interface UpdatePlanPayload {
  name?: string;
  priceCents?: number;
  interval?: "monthly" | "quarterly" | "annual";
  benefits?: string[];
  isActive?: boolean;
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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { message?: string; error?: string } = {};
    try {
      body = (await res.json()) as { message?: string; error?: string };
    } catch {
      // ignore parse errors
    }
    throw new ApiError(
      body.message ?? "Erro inesperado",
      res.status,
      body.error,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchPlans(
  accessToken: string,
  activeOnly = false,
): Promise<PlanResponse[]> {
  const url = `${API_BASE}/api/plans${activeOnly ? "?activeOnly=true" : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<PlanResponse[]>(res);
}

export async function createPlan(
  payload: CreatePlanPayload,
  accessToken: string,
): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE}/api/plans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<PlanResponse>(res);
}

export async function updatePlan(
  planId: string,
  payload: UpdatePlanPayload,
  accessToken: string,
): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE}/api/plans/${planId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<PlanResponse>(res);
}

export async function deletePlan(
  planId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/plans/${planId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<void>(res);
}
