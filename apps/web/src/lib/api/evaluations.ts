import type { PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface EvaluationResponse {
  id: string;
  athleteId: string;
  athleteName: string;
  microcycle: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  technique: number;
  tactical: number;
  physical: number;
  mental: number;
  attitude: number;
  /** Arithmetic mean of the five scores, rounded to 2 decimal places. */
  averageScore: number;
  notes: string | null;
  actorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEvaluationPayload {
  athleteId: string;
  /** ISO week string e.g. "2025-W03" */
  microcycle: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
  technique: number;
  tactical: number;
  physical: number;
  mental: number;
  attitude: number;
  notes?: string;
}

export interface UpdateEvaluationPayload {
  technique?: number;
  tactical?: number;
  physical?: number;
  mental?: number;
  attitude?: number;
  notes?: string | null;
}

export interface ListEvaluationsParams {
  athleteId?: string;
  microcycle?: string;
  /** ISO date lower bound (inclusive) */
  from?: string;
  /** ISO date upper bound (inclusive) */
  to?: string;
  page?: number;
  limit?: number;
}

export class EvaluationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EvaluationApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  throw new EvaluationApiError(
    body.message ?? `HTTP ${res.status}`,
    res.status,
  );
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Lists evaluations with optional filters.
 * Both ADMIN and TREASURER can call this.
 */
export async function fetchEvaluations(
  params: ListEvaluationsParams,
  accessToken: string,
): Promise<PaginatedResponse<EvaluationResponse>> {
  const q = new URLSearchParams();
  if (params.athleteId) q.set("athleteId", params.athleteId);
  if (params.microcycle) q.set("microcycle", params.microcycle);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));

  const res = await fetch(`${API_BASE}/api/evaluations?${q.toString()}`, {
    headers: authHeaders(accessToken),
    credentials: "include",
  });
  return handleResponse<PaginatedResponse<EvaluationResponse>>(res);
}

/**
 * Creates a new evaluation. Requires ADMIN role.
 * Returns 409 if an evaluation already exists for (athleteId, microcycle).
 */
export async function createEvaluation(
  payload: CreateEvaluationPayload,
  accessToken: string,
): Promise<EvaluationResponse> {
  const res = await fetch(`${API_BASE}/api/evaluations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<EvaluationResponse>(res);
}

/**
 * Partially updates an evaluation's scores or notes. Requires ADMIN role.
 */
export async function updateEvaluation(
  evaluationId: string,
  payload: UpdateEvaluationPayload,
  accessToken: string,
): Promise<EvaluationResponse> {
  const res = await fetch(`${API_BASE}/api/evaluations/${evaluationId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken),
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<EvaluationResponse>(res);
}

/**
 * Deletes an evaluation. Requires ADMIN role.
 */
export async function deleteEvaluation(
  evaluationId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/evaluations/${evaluationId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new EvaluationApiError(
      body.message ?? `HTTP ${res.status}`,
      res.status,
    );
  }
}
