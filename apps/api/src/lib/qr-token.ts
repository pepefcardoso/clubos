import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env.js";

/**
 * Deterministic HMAC-SHA256 token for ticket QR codes.
 *
 * Determinism is intentional: re-sending the confirmation email for the same
 * ticket produces the same token, so existing printed QR codes remain valid.
 *
 * The gate validator (T-143) must use verifyQrToken() with timingSafeEqual
 * to prevent timing oracle attacks at the scan endpoint.
 */
export function generateQrToken(ticketId: string, eventId: string): string {
  const { ACCESS_QR_SECRET } = getEnv();
  return createHmac("sha256", ACCESS_QR_SECRET)
    .update(`${ticketId}:${eventId}`)
    .digest("base64url");
}

/**
 * Verifies a QR token using constant-time comparison.
 *
 * Returns false when the token is structurally invalid (wrong length)
 * before reaching the timing-safe comparison, which requires equal-length
 * buffers. Both branches are indistinguishable from the caller's perspective.
 */
export function verifyQrToken(
  token: string,
  ticketId: string,
  eventId: string,
): boolean {
  const expected = generateQrToken(ticketId, eventId);
  if (expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}
