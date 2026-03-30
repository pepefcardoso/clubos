const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface BalanceSheetItem {
  id: string;
  title: string;
  /** Human-readable label, e.g. "2024", "1º Trimestre 2025" */
  period: string;
  /** Publicly accessible URL to the stored PDF file */
  fileUrl: string;
  /** SHA-256 hex digest of the original PDF bytes */
  fileHash: string;
  /** ISO 8601 string */
  publishedAt: string;
}

export interface BalanceSheetsListResponse {
  data: BalanceSheetItem[];
  total: number;
}

export class BalanceSheetsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "BalanceSheetsApiError";
  }
}

/**
 * Fetches all published balance sheets for a club, identified by its slug.
 * No authentication required — public compliance endpoint.
 *
 * Returns `{ data: [], total: 0 }` when the slug is unknown rather than
 * throwing, so the public page can render an empty state gracefully.
 */
export async function fetchPublicBalanceSheets(
  slug: string,
): Promise<BalanceSheetsListResponse> {
  const res = await fetch(
    `${API_BASE}/api/public/clubs/${encodeURIComponent(slug)}/balance-sheets`,
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new BalanceSheetsApiError(
      body.message ?? `Erro ao buscar balanços: ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<BalanceSheetsListResponse>;
}

/**
 * Uploads and publishes a PDF balance sheet for the authenticated club.
 * Requires an ADMIN access token.
 *
 * @param clubId       The authenticated club's ID (from JWT)
 * @param file         The PDF File object from a file input
 * @param title        Human-readable title, e.g. "Balanço Patrimonial 2024"
 * @param period       Period label, e.g. "2024" or "1º Trimestre 2025"
 * @param accessToken  JWT access token from useAuth()
 */
export async function uploadBalanceSheet(
  clubId: string,
  file: File,
  title: string,
  period: string,
  accessToken: string,
): Promise<BalanceSheetItem> {
  const formData = new FormData();
  formData.append("pdf", file, file.name);
  formData.append("title", title);
  formData.append("period", period);

  const res = await fetch(
    `${API_BASE}/api/clubs/${encodeURIComponent(clubId)}/balance-sheets`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
      body: formData,
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new BalanceSheetsApiError(
      body.message ?? `Erro ao publicar balanço: ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<BalanceSheetItem>;
}
