import type {
  ShowcaseTier,
  ShowcaseSnapshot,
} from "../../../../../packages/shared-types/src/index.js";
import { ApiError } from "./athletes.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ShowcaseResponse {
  id: string;
  clubId: string;
  athleteId: string;
  tier: ShowcaseTier;
  snapshot: ShowcaseSnapshot;
  snapshotHash: string;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishShowcasePayload {
  tier: ShowcaseTier;
}

export async function fetchShowcase(
  athleteId: string,
  accessToken: string,
): Promise<ShowcaseResponse | null> {
  const res = await fetch(`${API_BASE}/api/athletes/${athleteId}/showcase`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `HTTP ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<ShowcaseResponse>;
}

export async function publishShowcase(
  athleteId: string,
  tier: ShowcaseTier,
  accessToken: string,
): Promise<ShowcaseResponse> {
  const res = await fetch(`${API_BASE}/api/athletes/${athleteId}/showcase`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ tier }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new ApiError(
      body.message ?? `HTTP ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json() as Promise<ShowcaseResponse>;
}
