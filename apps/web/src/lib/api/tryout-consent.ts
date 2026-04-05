const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface RecordConsentPayload {
  clubSlug: string;
  athleteName: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelationship: "mae" | "pai" | "avo" | "tio" | "outro";
  consentVersion: string;
}

export interface RecordConsentResponse {
  consentId: string;
  consentToken: string;
  issuedAt: string;
}

export class ConsentApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ConsentApiError";
  }
}

/**
 * Records parental consent in the club's audit_log via the Fastify API.
 *
 * On success, returns a short-lived HMAC token (TTL 2 hours) that the
 * TryoutForm must append as the "consentToken" field in its final submission.
 * The Next.js /api/peneiras route verifies this token as a backend hard-stop
 * for minor athletes.
 *
 * @throws ConsentApiError on 4xx/5xx responses with parsed error message.
 */
export async function recordParentalConsent(
  payload: RecordConsentPayload,
): Promise<RecordConsentResponse> {
  const res = await fetch(`${API_BASE}/api/public/tryout-consent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ConsentApiError(
      body.message ?? `Erro ao registrar consentimento: ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<RecordConsentResponse>;
}

/**
 * The current consent document version.
 * Must match CURRENT_CONSENT_VERSION in apps/api/src/modules/tryout/consent-text.ts.
 */
export const CURRENT_CONSENT_VERSION = "v1.0";
