import { createHmac, timingSafeEqual, createHash } from "node:crypto";

/**
 * Returns the CONSENT_HMAC_SECRET from environment.
 *
 * Throws at startup if missing or too short — fail-fast so misconfigured
 * deployments surface immediately rather than issuing unverifiable tokens.
 */
export function getConsentHmacSecret(): string {
  const secret = process.env["CONSENT_HMAC_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "Missing or too-short CONSENT_HMAC_SECRET env var. " +
        "Must be at least 32 characters. " +
        "Generate with: openssl rand -base64 32",
    );
  }
  return secret;
}

/**
 * Issues a short-lived consent token tied to a specific consent record and club.
 *
 * Format: base64url(payload) + "." + HMAC-SHA256-hex(payload, secret)
 *   payload = "{consentId}|{clubId}|{issuedAt_ISO}"
 *
 * The token is single-use in spirit but not enforced server-side (stateless).
 * The 2-hour TTL is the primary expiry mechanism.
 */
export function issueConsentToken(
  consentId: string,
  clubId: string,
): { token: string; issuedAt: Date } {
  const issuedAt = new Date();
  const payload = `${consentId}|${clubId}|${issuedAt.toISOString()}`;
  const secret = getConsentHmacSecret();
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  const token = Buffer.from(payload).toString("base64url") + "." + hmac;
  return { token, issuedAt };
}

/**
 * Verifies a consent token and returns the parsed payload on success,
 * or null on any failure.
 *
 * Checks performed (in order):
 *   1. Structural validity — two parts separated by "."
 *   2. HMAC signature — timing-safe comparison against recomputed value
 *   3. Club ownership — embedded clubId must match expectedClubId
 *   4. Token age — must be issued within the last 2 hours
 */
export function verifyConsentToken(
  token: string,
  expectedClubId: string,
): { consentId: string; clubId: string; issuedAt: Date } | null {
  try {
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const payloadB64 = token.slice(0, dotIndex);
    const providedHmac = token.slice(dotIndex + 1);

    const payload = Buffer.from(payloadB64, "base64url").toString();
    const parts = payload.split("|");
    if (parts.length !== 3) return null;

    const [consentId, clubId, issuedAtStr] = parts as [string, string, string];

    const secret = getConsentHmacSecret();
    const expectedHmac = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    if (expectedHmac.length !== providedHmac.length) return null;

    const isValid = timingSafeEqual(
      Buffer.from(expectedHmac, "hex"),
      Buffer.from(providedHmac, "hex"),
    );
    if (!isValid) return null;

    if (clubId !== expectedClubId) return null;

    const issuedAt = new Date(issuedAtStr);
    const ageMs = Date.now() - issuedAt.getTime();
    if (ageMs > 2 * 60 * 60 * 1000) return null;

    return { consentId, clubId, issuedAt };
  } catch {
    return null;
  }
}

/**
 * Computes the SHA-256 hash of the full consent payload for tamper-evidence.
 *
 * The hash covers the consent text actually shown to the guardian, not just
 * the metadata. Stored in audit_log.metadata.consentHash so future auditors
 * can verify the document version matches what was accepted.
 */
export function computeConsentHash(params: {
  athleteName: string;
  guardianName: string;
  guardianPhone: string;
  guardianRelationship: string;
  clubSlug: string;
  consentVersion: string;
  consentText: string;
  issuedAt: string;
}): string {
  return createHash("sha256").update(JSON.stringify(params)).digest("hex");
}
