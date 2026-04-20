const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ValidateAccessPayload {
  token: string;
  idempotencyKey?: string;
  scannedAt?: string;
}

export interface ValidateAccessResponse {
  valid: boolean;
  accessLogId: string;
  reason?: string;
  scannedAt: string;
}

/**
 * Thrown when the server returns a non-2xx response.
 * HTTP 400 → bad body (schema mismatch).
 * HTTP 401 → access token missing or expired.
 * Note: HTTP 200 with `valid: false` is NOT an error — it is a normal
 * "access denied" result and will NOT throw this error.
 */
export class FieldAccessApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "FieldAccessApiError";
  }
}

/**
 * POST /api/events/:eventId/access/validate
 *
 * Always returns HTTP 200 on the server side (valid/invalid are both 200).
 * This function throws only on network errors or non-200 HTTP status codes
 * (400 bad body, 401 unauthorized).
 *
 * Idempotency: passing `idempotencyKey = localId` ensures that retried
 * offline syncs do not create duplicate `field_access_log` rows.
 */
export async function validateAccess(
  eventId: string,
  payload: ValidateAccessPayload,
  accessToken: string,
): Promise<ValidateAccessResponse> {
  const res = await fetch(
    `${API_BASE}/api/events/${encodeURIComponent(eventId)}/access/validate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new FieldAccessApiError(
      body.message ?? `HTTP ${res.status}`,
      res.status,
    );
  }

  return res.json() as Promise<ValidateAccessResponse>;
}
