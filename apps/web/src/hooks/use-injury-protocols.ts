"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface InjuryProtocolSummary {
  id: string;
  name: string;
  structure: string;
  grade: string;
  durationDays: number;
  isActive: boolean;
}

export interface InjuryProtocolResponse extends InjuryProtocolSummary {
  source: string;
  steps: Array<{ day: string; activity: string }>;
  createdAt: string;
}

export interface PaginatedProtocols {
  data: InjuryProtocolSummary[];
  total: number;
  page: number;
  limit: number;
}

async function fetchInjuryProtocols(
  filters: { structure?: string; grade?: string; limit?: number },
  token: string,
): Promise<PaginatedProtocols> {
  const query = new URLSearchParams();
  if (filters.structure) query.set("structure", filters.structure);
  if (filters.grade) query.set("grade", filters.grade);
  query.set("limit", String(filters.limit ?? 100));

  const res = await fetch(
    `${API_BASE}/api/injury-protocols?${query.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, credentials: "include" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<PaginatedProtocols>;
}

async function fetchInjuryProtocolById(
  protocolId: string,
  token: string,
): Promise<InjuryProtocolResponse> {
  const res = await fetch(`${API_BASE}/api/injury-protocols/${protocolId}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<InjuryProtocolResponse>;
}

interface UseInjuryProtocolsParams {
  structure?: string;
  grade?: string;
  enabled?: boolean;
}

/**
 * Fetches the list of injury protocol summaries, optionally filtered by
 * structure and/or grade. Used by `ProtocolSelector` to populate the list.
 *
 * staleTime: 10 min — the protocol library is seeded at provision time and
 * rarely changes, so aggressive caching is appropriate.
 */
export function useInjuryProtocols({
  structure,
  grade,
  enabled = true,
}: UseInjuryProtocolsParams = {}) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: ["injury-protocols", { structure, grade }],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchInjuryProtocols({ structure, grade, limit: 100 }, token);
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    select: (data) => data.data,
  });
}

/**
 * Fetches the full detail for a single protocol, including the steps array.
 * Used by `ProtocolDetailDrawer` to render the rehabilitation timeline.
 *
 * Disabled when protocolId is null (no selection).
 */
export function useInjuryProtocol(protocolId: string | null) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: ["injury-protocol", protocolId],
    queryFn: async () => {
      if (!protocolId) throw new Error("protocolId is required");
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchInjuryProtocolById(protocolId, token);
    },
    enabled: protocolId !== null,
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
  });
}
