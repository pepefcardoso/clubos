import type { PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface FanResponse {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  totalSpentCents: number;
  eventCount: number;
  createdAt: string;
}

export interface FetchFansParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: "totalSpentCents" | "createdAt";
  order?: "asc" | "desc";
}

export class FansApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "FansApiError";
  }
}

export async function fetchFans(
  params: FetchFansParams,
  accessToken: string,
): Promise<PaginatedResponse<FanResponse>> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.sortBy) q.set("sortBy", params.sortBy);
  if (params.order) q.set("order", params.order);

  const res = await fetch(`${API_BASE}/api/fans?${q.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new FansApiError(
      body.message ?? "Erro ao carregar torcedores",
      res.status,
    );
  }

  return res.json() as Promise<PaginatedResponse<FanResponse>>;
}
