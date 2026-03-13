import { ApiError } from "./members";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ImportRowError {
  row: number;
  cpf?: string;
  field: string;
  message: string;
}

export interface ImportSuccessResponse {
  imported: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
}

/**
 * Uploads a CSV file to POST /api/members/import.
 * Uses multipart/form-data — do NOT set Content-Type manually (browser sets boundary).
 *
 * @throws {ApiError} on HTTP 4xx/5xx or network failure
 */
export async function importMembersCsv(
  file: File,
  accessToken: string,
): Promise<ImportSuccessResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/members/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? "Erro ao importar arquivo CSV",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<ImportSuccessResponse>;
}
