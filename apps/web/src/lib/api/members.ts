import type {
  PaginatedResponse,
  MemberStatus,
} from "../../../../../packages/shared-types/src/index.js";
import type { MemberResponse } from "../../../../api/src/modules/members/members.schema";

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

export interface FetchMembersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: MemberStatus | "";
}

export interface CreateMemberPayload {
  name: string;
  cpf: string;
  phone: string;
  email?: string;
  planId?: string;
  joinedAt?: string;
}

export interface UpdateMemberPayload {
  name?: string;
  phone?: string;
  email?: string | null;
  planId?: string | null;
  status?: "ACTIVE" | "INACTIVE" | "OVERDUE";
}

export type { MemberResponse };

export async function fetchMembers(
  params: FetchMembersParams,
  accessToken: string,
): Promise<PaginatedResponse<MemberResponse>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search && params.search.trim() !== "")
    query.set("search", params.search.trim());
  if (params.status) query.set("status", params.status);

  const res = await fetch(`${API_BASE}/api/members?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Failed to fetch members: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<PaginatedResponse<MemberResponse>>;
}

export async function createMember(
  payload: CreateMemberPayload,
  accessToken: string,
): Promise<MemberResponse> {
  const res = await fetch(`${API_BASE}/api/members`, {
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
      body.message ?? "Erro ao cadastrar sócio",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MemberResponse>;
}

export async function updateMember(
  memberId: string,
  payload: UpdateMemberPayload,
  accessToken: string,
): Promise<MemberResponse> {
  const res = await fetch(`${API_BASE}/api/members/${memberId}`, {
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
      body.message ?? "Erro ao atualizar sócio",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MemberResponse>;
}

export async function getMember(
  memberId: string,
  accessToken: string,
): Promise<MemberResponse> {
  const res = await fetch(`${API_BASE}/api/members/${memberId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? "Sócio não encontrado",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MemberResponse>;
}

export interface MemberPaymentChargeDetail {
  id: string;
  dueDate: string;
  status: string;
  method: string;
  amountCents: number;
  gatewayName: string | null;
  createdAt: string;
}

export interface MemberPaymentItem {
  paymentId: string;
  chargeId: string;
  paidAt: string;
  method: string;
  amountCents: number;
  gatewayTxid: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  charge: MemberPaymentChargeDetail;
}

export interface MemberPaymentsResponse {
  data: MemberPaymentItem[];
  meta: { total: number; page: number; limit: number };
}

export async function fetchMemberPayments(
  memberId: string,
  accessToken: string,
  page = 1,
  limit = 20,
): Promise<MemberPaymentsResponse> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const res = await fetch(
    `${API_BASE}/api/members/${memberId}/payments?${query.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro ao carregar histórico de pagamentos: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MemberPaymentsResponse>;
}
