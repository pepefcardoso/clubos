import type { PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type ExerciseCategory =
  | "STRENGTH"
  | "CARDIO"
  | "TECHNICAL"
  | "TACTICAL"
  | "RECOVERY"
  | "OTHER";

export interface ExerciseResponse {
  id: string;
  name: string;
  description: string | null;
  category: ExerciseCategory;
  muscleGroups: string[];
  isActive: boolean;
  createdAt: string;
}

export interface FetchExercisesParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: ExerciseCategory;
  includeInactive?: boolean;
}

export class ExerciseApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public error?: string,
  ) {
    super(message);
    this.name = "ExerciseApiError";
  }
}

export async function fetchExercises(
  params: FetchExercisesParams,
  accessToken: string,
): Promise<PaginatedResponse<ExerciseResponse>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.category) query.set("category", params.category);
  if (params.includeInactive) query.set("includeInactive", "true");

  const res = await fetch(`${API_BASE}/api/exercises?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ExerciseApiError(
      body.message ?? `Failed to fetch exercises: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<PaginatedResponse<ExerciseResponse>>;
}
