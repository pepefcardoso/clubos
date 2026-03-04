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
