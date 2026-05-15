import {
  ClubContactRequestsResponse,
  RespondContactRequestResponse,
} from "../../../../../packages/shared-types/src";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ClubContactRequestApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ClubContactRequestApiError";
  }
}

async function clubContactFetch<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ClubContactRequestApiError(
      res.status,
      body.message ?? `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export async function fetchClubContactRequests(
  token: string,
): Promise<ClubContactRequestsResponse> {
  return clubContactFetch("/api/contact-requests", token);
}

export async function respondContactRequest(
  token: string,
  contactRequestId: string,
  action: "ACCEPT" | "REJECT",
  reason?: string,
): Promise<RespondContactRequestResponse> {
  return clubContactFetch(`/api/contact-requests/${contactRequestId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      action,
      ...(reason !== undefined ? { reason } : {}),
    }),
  });
}
