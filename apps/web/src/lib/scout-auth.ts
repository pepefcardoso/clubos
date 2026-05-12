const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export interface ScoutAuthUser {
  id: string;
  name: string;
  email: string;
}

export interface ScoutLoginResult {
  accessToken: string;
  scout: ScoutAuthUser;
}

export class ScoutAuthApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ScoutAuthApiError";
  }
}

async function scoutFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ScoutAuthApiError(res.status, body.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function apiScoutRegister(body: {
  name: string;
  email: string;
  password: string;
  specialization?: string;
  targetPositions: string[];
  targetAgeRanges: string[];
  crmNumber?: string;
}): Promise<{ id: string }> {
  return scoutFetch("/api/auth/scout/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiScoutLogin(
  email: string,
  password: string,
): Promise<ScoutLoginResult> {
  return scoutFetch("/api/auth/scout/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiScoutRefresh(): Promise<{ accessToken: string }> {
  return scoutFetch("/api/auth/scout/refresh", { method: "POST" });
}

export async function apiScoutLogout(accessToken?: string): Promise<void> {
  await scoutFetch("/api/auth/scout/logout", {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
}
