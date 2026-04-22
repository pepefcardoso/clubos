const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface PhysioClub {
  clubId: string;
  clubName: string;
  clubLogoUrl: string | null;
  isPrimary: boolean;
}

export interface MultiClubAtRiskAthlete {
  athleteId: string;
  athleteName: string;
  position: string | null;
  currentAcwr: number;
  currentRiskZone: string;
  lastInjuryStructure: string | null;
  clubId: string;
  clubName: string;
}

export interface MultiClubDashboardResponse {
  athletes: MultiClubAtRiskAthlete[];
  clubCount: number;
  acwrDataAsOf: string | null;
}

export interface SwitchClubResult {
  accessToken: string;
}

export interface GrantAccessResult {
  id: string;
}

export class PhysioApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public error?: string,
  ) {
    super(message);
    this.name = "PhysioApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    throw new PhysioApiError(
      body.message ?? `Erro ${res.status}`,
      res.status,
      body.error,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function fetchPhysioClubs(
  accessToken: string,
): Promise<PhysioClub[]> {
  const res = await fetch(`${API_BASE}/api/physio/clubs`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  const data = await handleResponse<{ clubs: PhysioClub[] }>(res);
  return data.clubs;
}

export async function switchPhysioClub(
  targetClubId: string,
  accessToken: string,
): Promise<SwitchClubResult> {
  const res = await fetch(`${API_BASE}/api/physio/switch-club`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ targetClubId }),
  });
  return handleResponse<SwitchClubResult>(res);
}

export async function fetchMultiClubDashboard(
  minAcwr: number,
  accessToken: string,
): Promise<MultiClubDashboardResponse> {
  const query = new URLSearchParams({ minAcwr: String(minAcwr) });
  const res = await fetch(`${API_BASE}/api/physio/dashboard?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<MultiClubDashboardResponse>(res);
}

export async function grantPhysioAccess(
  physioUserId: string,
  targetClubId: string,
  accessToken: string,
): Promise<GrantAccessResult> {
  const res = await fetch(`${API_BASE}/api/physio/club-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ physioUserId, targetClubId }),
  });
  return handleResponse<GrantAccessResult>(res);
}

export async function revokePhysioAccess(
  accessId: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/physio/club-access/${accessId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function transferMedicalRecord(
  recordId: string,
  targetClubId: string,
  consentNotes: string,
  accessToken: string,
): Promise<{ newRecordId: string }> {
  const res = await fetch(
    `${API_BASE}/api/medical-records/${recordId}/transfer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ targetClubId, consentNotes }),
    },
  );
  return handleResponse<{ newRecordId: string }>(res);
}
