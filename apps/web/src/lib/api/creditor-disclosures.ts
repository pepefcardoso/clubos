const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const CREDITOR_STATUSES = ["PENDING", "SETTLED", "DISPUTED"] as const;
export type CreditorStatus = (typeof CREDITOR_STATUSES)[number];

export const STATUS_LABELS: Record<CreditorStatus, string> = {
  PENDING: "Pendente",
  SETTLED: "Liquidado",
  DISPUTED: "Em Disputa",
};

export const STATUS_COLORS: Record<
  CreditorStatus,
  { bg: string; text: string; border: string }
> = {
  PENDING: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  SETTLED: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  DISPUTED: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
};

export interface CreditorDisclosureItem {
  id: string;
  creditorName: string;
  description: string | null;
  amountCents: number;
  /** ISO YYYY-MM-DD */
  dueDate: string;
  status: CreditorStatus;
  registeredBy: string;
  /** ISO 8601 */
  registeredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditorDisclosuresListResult {
  data: CreditorDisclosureItem[];
  total: number;
  page: number;
  limit: number;
  /** Sum of all PENDING amountCents — SAF KPI dashboard use */
  pendingTotalCents: number;
}

export interface FetchCreditorDisclosuresParams {
  page?: number;
  limit?: number;
  status?: CreditorStatus;
  dueDateFrom?: string;
  dueDateTo?: string;
}

export interface CreateCreditorDisclosurePayload {
  creditorName: string;
  description?: string;
  amountCents: number;
  /** YYYY-MM-DD */
  dueDate: string;
}

export class CreditorDisclosureApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly error?: string,
  ) {
    super(message);
    this.name = "CreditorDisclosureApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new CreditorDisclosureApiError(
      body.message ?? `Erro: ${res.status}`,
      res.status,
      body.error,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchCreditorDisclosures(
  params: FetchCreditorDisclosuresParams,
  accessToken: string,
): Promise<CreditorDisclosuresListResult> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.status) q.set("status", params.status);
  if (params.dueDateFrom) q.set("dueDateFrom", params.dueDateFrom);
  if (params.dueDateTo) q.set("dueDateTo", params.dueDateTo);

  const res = await fetch(
    `${API_BASE}/api/creditor-disclosures?${q.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );
  return handleResponse<CreditorDisclosuresListResult>(res);
}

export async function createCreditorDisclosure(
  payload: CreateCreditorDisclosurePayload,
  accessToken: string,
): Promise<CreditorDisclosureItem> {
  const res = await fetch(`${API_BASE}/api/creditor-disclosures`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<CreditorDisclosureItem>(res);
}

export async function updateCreditorStatus(
  id: string,
  status: "SETTLED" | "DISPUTED",
  accessToken: string,
): Promise<CreditorDisclosureItem> {
  const res = await fetch(`${API_BASE}/api/creditor-disclosures/${id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ status }),
  });
  return handleResponse<CreditorDisclosureItem>(res);
}

/**
 * Triggers a PDF download and returns the SHA-256 hash from the response header
 * and the blob for browser download.
 */
export async function exportCreditorDisclosuresPdf(
  accessToken: string,
): Promise<{ blob: Blob; hash: string; recordCount: number }> {
  const res = await fetch(`${API_BASE}/api/creditor-disclosures/export/pdf`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new CreditorDisclosureApiError(
      body.message ?? "Erro ao exportar PDF.",
      res.status,
    );
  }

  const blob = await res.blob();
  const hash = res.headers.get("X-Export-Hash") ?? "";
  const recordCount = Number(res.headers.get("X-Export-Record-Count") ?? "0");

  return { blob, hash, recordCount };
}
