import type { ApiError } from "./../../../../packages/shared-types/src";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface AuthUser {
  id: string;
  email: string;
  role: "ADMIN" | "TREASURER";
  clubId: string;
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResult {
  accessToken: string;
}

class AuthApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly error: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  let body: ApiError;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    throw new AuthApiError(
      res.status,
      "Error",
      "Erro de conexão. Tente novamente.",
    );
  }

  throw new AuthApiError(body.statusCode, body.error, body.message);
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return handleResponse<LoginResult>(res);
}

export async function apiRefresh(): Promise<RefreshResult> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  return handleResponse<RefreshResult>(res);
}

export async function apiLogout(accessToken?: string): Promise<void> {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  const res = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers,
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export { AuthApiError };
