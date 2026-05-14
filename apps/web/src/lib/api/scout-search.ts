import { ScoutAuthApiError } from "@/lib/scout-auth";
import {
  PaginatedResponse,
  ScoutAthleteResult,
  ScoutAthleteProfile,
} from "../../../../../packages/shared-types/src";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export interface ScoutSearchParams {
  position?: string;
  minAge?: number;
  maxAge?: number;
  state?: string;
  rtpStatus?: "AFASTADO" | "RETORNO_PROGRESSIVO" | "LIBERADO";
  minAcwr?: number;
  maxAcwr?: number;
  page: number;
  limit: number;
}

export class ScoutSearchApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ScoutSearchApiError";
  }
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

export async function fetchScoutAthletes(
  params: ScoutSearchParams,
  accessToken: string,
): Promise<PaginatedResponse<ScoutAthleteResult>> {
  const q = new URLSearchParams();
  q.set("page", String(params.page));
  q.set("limit", String(params.limit));
  if (params.position) q.set("position", params.position);
  if (params.minAge != null) q.set("minAge", String(params.minAge));
  if (params.maxAge != null) q.set("maxAge", String(params.maxAge));
  if (params.state) q.set("state", params.state);
  if (params.rtpStatus) q.set("rtpStatus", params.rtpStatus);
  if (params.minAcwr != null) q.set("minAcwr", String(params.minAcwr));
  if (params.maxAcwr != null) q.set("maxAcwr", String(params.maxAcwr));

  const res = await fetch(`${API_BASE}/api/scout/athletes?${q.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ScoutAuthApiError(
      res.status,
      body.message ?? `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<PaginatedResponse<ScoutAthleteResult>>;
}

export async function fetchAthleteProfile(
  showcaseId: string,
  token: string,
): Promise<ScoutAthleteProfile> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/scout/athletes/${showcaseId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiError;
    throw new ScoutSearchApiError(res.status, body.message ?? res.statusText);
  }

  return res.json() as Promise<ScoutAthleteProfile>;
}
