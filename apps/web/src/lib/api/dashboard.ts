import { MonthlyChargeStat } from "../../../../../packages/shared-types/src";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface DashboardSummary {
  members: {
    total: number;
    active: number;
    inactive: number;
    overdue: number;
  };
  charges: {
    pendingCount: number;
    pendingAmountCents: number;
    overdueCount: number;
    overdueAmountCents: number;
  };
  payments: {
    paidThisMonthCount: number;
    paidThisMonthAmountCents: number;
  };
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

export async function fetchDashboardSummary(
  accessToken: string,
): Promise<DashboardSummary> {
  const res = await fetch(`${API_BASE}/api/dashboard/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro ao carregar dashboard: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<DashboardSummary>;
}

export async function fetchChargesHistory(
  accessToken: string,
  months = 6,
): Promise<MonthlyChargeStat[]> {
  const res = await fetch(
    `${API_BASE}/api/dashboard/charges-history?months=${months}`,
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
      body.message ?? `Erro ao carregar histórico: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<MonthlyChargeStat[]>;
}

export interface OverdueMemberRow {
  memberId: string;
  memberName: string;
  chargeId: string;
  amountCents: number;
  dueDate: string;
  daysPastDue: number;
}

export interface OverdueMembersResult {
  data: OverdueMemberRow[];
  total: number;
  page: number;
  limit: number;
}

export interface RemindMemberResult {
  messageId: string;
  status: "SENT" | "FAILED";
  failReason?: string | undefined;
}

/**
 * Fetches paginated overdue members from GET /api/dashboard/overdue-members.
 */
export async function fetchOverdueMembers(
  accessToken: string,
  page = 1,
  limit = 20,
): Promise<OverdueMembersResult> {
  const res = await fetch(
    `${API_BASE}/api/dashboard/overdue-members?page=${page}&limit=${limit}`,
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
      body.message ?? `Erro ao carregar inadimplentes: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<OverdueMembersResult>;
}

/**
 * Triggers an on-demand WhatsApp reminder for a member via POST /api/members/:id/remind.
 * Throws ApiError on HTTP 4xx / 5xx — callers should handle 429 specially.
 */
export async function remindMember(
  accessToken: string,
  memberId: string,
): Promise<RemindMemberResult> {
  const res = await fetch(`${API_BASE}/api/members/${memberId}/remind`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? "Erro ao enviar lembrete",
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<RemindMemberResult>;
}
