import { ScoutContactRequestsResponse } from "../../../../../packages/shared-types/src";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ContactRequestApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ContactRequestApiError";
  }
}

export async function fetchScoutContactRequests(
  token: string,
): Promise<ScoutContactRequestsResponse> {
  const res = await fetch(`${API_BASE}/api/scout/contact-requests`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ContactRequestApiError(
      res.status,
      body.message ?? `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<ScoutContactRequestsResponse>;
}
