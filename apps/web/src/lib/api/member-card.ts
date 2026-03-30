const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface MemberCardResponse {
  cardToken: string;
  expiresAt: string;
  member: {
    id: string;
    name: string;
    status: string;
    joinedAt: string;
  };
  club: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
}

export interface VerifyCardResponse {
  valid: boolean;
  reason?: string;
  memberName?: string;
  memberStatus?: string;
  clubName?: string;
  clubLogoUrl?: string | null;
  verifiedAt?: string;
}

export class MemberCardApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MemberCardApiError";
  }
}

/**
 * Fetches a signed 24-hour digital membership card for the given member.
 * Requires a valid access token (ADMIN or TREASURER).
 *
 * @throws {MemberCardApiError} on HTTP 4xx/5xx
 */
export async function fetchMemberCard(
  memberId: string,
  accessToken: string,
): Promise<MemberCardResponse> {
  const res = await fetch(`${API_BASE}/api/members/${memberId}/card`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new MemberCardApiError(
      body.message ?? "Erro ao gerar carteirinha",
      res.status,
    );
  }

  return res.json() as Promise<MemberCardResponse>;
}

/**
 * Verifies a card token against the public verification endpoint.
 * No authentication required — anyone scanning a QR code calls this.
 *
 * Never throws — returns { valid: false, reason } on any failure, matching
 * the backend's always-200 contract.
 */
export async function verifyMemberCard(
  token: string,
): Promise<VerifyCardResponse> {
  try {
    const res = await fetch(
      `${API_BASE}/api/public/verify-member-card?token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) {
      return { valid: false, reason: "Erro de conexão." };
    }
    return res.json() as Promise<VerifyCardResponse>;
  } catch {
    return { valid: false, reason: "Erro de conexão. Verifique sua internet." };
  }
}
