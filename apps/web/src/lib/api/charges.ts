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

export type ChargeStatus =
  | "PENDING"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED"
  | "PENDING_RETRY";

export interface ChargeListItem {
  id: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  /** ISO string from API */
  dueDate: string;
  status: ChargeStatus;
  method: string;
  gatewayName: string | null;
  externalId: string | null;
  gatewayMeta: Record<string, unknown> | null;
  retryCount: number;
  createdAt: string;
}

export interface ChargesListResult {
  data: ChargeListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface FetchChargesParams {
  page?: number;
  limit?: number;
  /** YYYY-MM */
  month?: string;
  status?: string;
  memberId?: string;
}

export async function fetchCharges(
  params: FetchChargesParams,
  accessToken: string,
): Promise<ChargesListResult> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.month) q.set("month", params.month);
  if (params.status) q.set("status", params.status);
  if (params.memberId) q.set("memberId", params.memberId);

  const res = await fetch(`${API_BASE}/api/charges?${q.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro ao carregar cobranças: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<ChargesListResult>;
}

export interface GenerateChargesPayload {
  billingPeriod?: string;
  dueDate?: string;
}

export interface GenerateChargesResult {
  generated: number;
  skipped: number;
  errors: Array<{ memberId: string; reason: string }>;
  gatewayErrors: Array<{ chargeId: string; memberId: string; reason: string }>;
  staticPixFallbackCount: number;
}

export async function generateCharges(
  payload: GenerateChargesPayload,
  accessToken: string,
): Promise<GenerateChargesResult> {
  const res = await fetch(`${API_BASE}/api/charges/generate`, {
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
      body.message ?? `Erro ao gerar cobranças: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<GenerateChargesResult>;
}
