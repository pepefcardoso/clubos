"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface RtpResponse {
  athleteId: string;
  status: string | null;
  medicalRecordId?: string | null;
  protocolId?: string | null;
  clearedAt?: string | null;
  clearedBy?: string | null;
  notes?: string | null;
  updatedAt?: string;
}

async function fetchAthleteRtp(
  athleteId: string,
  token: string,
): Promise<RtpResponse> {
  const res = await fetch(`${API_BASE}/api/athletes/${athleteId}/rtp`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<RtpResponse>;
}

/**
 * Fetches the current RTP status for a single athlete.
 *
 * Returns the full payload for PHYSIO | ADMIN callers (status + notes +
 * clearedAt/By + FKs). The component should already be gated by
 * `canAccessClinicalData()` — this hook does not enforce role restrictions.
 *
 * staleTime 2 min — RTP status changes infrequently within a session and
 * an aggressive stale window would cause unnecessary re-fetches when the
 * timeline modal opens and closes.
 */
export function useAthleteRtp(athleteId: string | null) {
  const { getAccessToken } = useAuth();

  return useQuery({
    queryKey: ["athlete-rtp", athleteId],
    queryFn: async () => {
      if (!athleteId) throw new Error("athleteId required");
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      return fetchAthleteRtp(athleteId, token);
    },
    enabled: !!athleteId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
