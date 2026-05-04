import type { PaginatedResponse } from "../../../../../packages/shared-types/src/index.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type EventStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";

export interface EventSectorResponse {
  id: string;
  name: string;
  capacity: number;
  sold: number;
  priceCents: number;
}

export interface EventResponse {
  id: string;
  opponent: string;
  eventDate: string;
  venue: string;
  description: string | null;
  status: EventStatus;
  sectors: EventSectorResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface EventSectorInput {
  name: string;
  capacity: number;
  priceCents: number;
}

export interface CreateEventPayload {
  opponent: string;
  eventDate: string;
  venue: string;
  description?: string;
  sectors: EventSectorInput[];
}

export interface UpdateEventPayload {
  opponent?: string;
  eventDate?: string;
  venue?: string;
  description?: string | null;
}

export interface FetchEventsParams {
  page?: number;
  limit?: number;
  status?: EventStatus;
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
      body.message ?? "Erro inesperado",
      res.status,
      body.error,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchEvents(
  params: FetchEventsParams,
  accessToken: string,
): Promise<PaginatedResponse<EventResponse>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.status) query.set("status", params.status);

  const res = await fetch(`${API_BASE}/api/events?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<PaginatedResponse<EventResponse>>(res);
}

export async function createEvent(
  payload: CreateEventPayload,
  accessToken: string,
): Promise<EventResponse> {
  const res = await fetch(`${API_BASE}/api/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<EventResponse>(res);
}

export async function updateEvent(
  eventId: string,
  payload: UpdateEventPayload,
  accessToken: string,
): Promise<EventResponse> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<EventResponse>(res);
}

export async function cancelEvent(
  eventId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<void>(res);
}
