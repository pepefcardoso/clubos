const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface CreateClubPayload {
  name: string;
  slug: string;
  cnpj?: string;
}

export interface CreateClubResponse {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  planTier: string;
  createdAt: string;
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

export async function createClub(
  payload: CreateClubPayload,
): Promise<CreateClubResponse> {
  const body: CreateClubPayload = { name: payload.name, slug: payload.slug };
  if (payload.cnpj && payload.cnpj.trim() !== "") {
    body.cnpj = payload.cnpj;
  }

  const res = await fetch(`${API_BASE}/api/clubs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errBody: { message?: string; error?: string; statusCode?: number } = {};
    try {
      errBody = (await res.json()) as typeof errBody;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(
      errBody.message ?? "Erro ao criar clube",
      res.status,
      errBody.error,
    );
  }

  return res.json() as Promise<CreateClubResponse>;
}
