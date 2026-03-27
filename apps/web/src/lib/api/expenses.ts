const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const EXPENSE_CATEGORIES = [
  "SALARY",
  "FIELD_MAINTENANCE",
  "EQUIPMENT",
  "TRAVEL",
  "ADMINISTRATIVE",
  "OTHER",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  SALARY: "Salários",
  FIELD_MAINTENANCE: "Manutenção do campo",
  EQUIPMENT: "Equipamentos",
  TRAVEL: "Viagens",
  ADMINISTRATIVE: "Administrativo",
  OTHER: "Outros",
};

export interface ExpenseResponse {
  id: string;
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  /** ISO YYYY-MM-DD */
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensesListResult {
  data: ExpenseResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface FetchExpensesParams {
  page?: number;
  limit?: number;
  /** YYYY-MM */
  month?: string;
  category?: ExpenseCategory;
}

export interface CreateExpensePayload {
  description: string;
  amountCents: number;
  category: ExpenseCategory;
  date: string;
  notes?: string;
}

export interface UpdateExpensePayload {
  description?: string;
  amountCents?: number;
  category?: ExpenseCategory;
  date?: string;
  notes?: string | null;
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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `Erro: ${res.status}`,
      res.status,
      body.error,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchExpenses(
  params: FetchExpensesParams,
  accessToken: string,
): Promise<ExpensesListResult> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.month) query.set("month", params.month);
  if (params.category) query.set("category", params.category);

  const res = await fetch(`${API_BASE}/api/expenses?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<ExpensesListResult>(res);
}

export async function createExpense(
  payload: CreateExpensePayload,
  accessToken: string,
): Promise<ExpenseResponse> {
  const res = await fetch(`${API_BASE}/api/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<ExpenseResponse>(res);
}

export async function updateExpense(
  expenseId: string,
  payload: UpdateExpensePayload,
  accessToken: string,
): Promise<ExpenseResponse> {
  const res = await fetch(`${API_BASE}/api/expenses/${expenseId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<ExpenseResponse>(res);
}

export async function deleteExpense(
  expenseId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/expenses/${expenseId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<void>(res);
}
