/**
 * CSRF origin validation utility for Next.js API Routes.
 *
 * Implements the OWASP "Verifying Origin with Standard Headers" pattern:
 *   https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 *
 * Used exclusively by public marketing API routes (`/api/contact`).
 * Authenticated routes are protected by httpOnly refresh token + SameSite=Strict.
 */

export interface CsrfVerifyOptions {
  /** The NextRequest object (or any object with a `headers` property). */
  headers: Headers;
  /** Allowed host(s). Defaults to NEXT_PUBLIC_DOMAIN env var. */
  allowedHosts?: string[];
}

export interface CsrfVerifyResult {
  ok: boolean;
  /** Human-readable reason for failure — for server logs only, never sent to client. */
  reason?: string;
}

/**
 * Returns the canonical host list allowed to originate requests.
 * Always includes localhost variants in non-production environments.
 */
export function getAllowedHosts(): string[] {
  const domain = process.env["NEXT_PUBLIC_DOMAIN"];
  const hosts: string[] = [];

  if (domain) {
    hosts.push(domain);
    if (!domain.startsWith("www.")) {
      hosts.push(`www.${domain}`);
    }
  }

  if (process.env["NODE_ENV"] !== "production") {
    hosts.push("localhost");
    hosts.push("127.0.0.1");
  }

  return hosts;
}

/**
 * Extracts just the hostname from an Origin or Referer header value.
 * Returns null if the value is absent, malformed, or the scheme is not http(s).
 *
 * @example
 * extractHost('https://clubos.com.br')      // → 'clubos.com.br'
 * extractHost('https://clubos.com.br/path') // → 'clubos.com.br'
 * extractHost('null')                       // → null  (privacy-sensitive origin)
 * extractHost(null)                         // → null
 */
export function extractHost(value: string | null | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname;
  } catch {
    return null;
  }
}

/**
 * Verifies that a request originates from an allowed host using the
 * Origin and Referer headers. Also validates the custom X-Requested-With
 * header as a belt-and-suspenders measure.
 *
 * Rules (evaluated in order):
 *  1. If X-Requested-With is missing or wrong value → fail.
 *  2. Prefer Origin header. If present and host is allowed → pass.
 *  3. Fall back to Referer header. If present and host is allowed → pass.
 *  4. If both headers are absent and NODE_ENV !== production → pass
 *     (allows curl/Postman in development).
 *  5. Otherwise → fail.
 */
export function verifyCsrfOrigin(options: CsrfVerifyOptions): CsrfVerifyResult {
  const { headers, allowedHosts = getAllowedHosts() } = options;

  const requestedWith = headers.get("x-requested-with");
  if (requestedWith !== "XMLHttpRequest") {
    return {
      ok: false,
      reason: `Missing or invalid X-Requested-With header (got: "${requestedWith ?? "absent"}")`,
    };
  }

  const origin = headers.get("origin");
  const referer = headers.get("referer");

  const originHost = extractHost(origin);
  if (originHost !== null) {
    if (allowedHosts.includes(originHost)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `Origin host "${originHost}" not in allowed list: [${allowedHosts.join(", ")}]`,
    };
  }

  const refererHost = extractHost(referer);
  if (refererHost !== null) {
    if (allowedHosts.includes(refererHost)) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `Referer host "${refererHost}" not in allowed list: [${allowedHosts.join(", ")}]`,
    };
  }

  if (process.env["NODE_ENV"] !== "production") {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "Both Origin and Referer headers are absent in production",
  };
}
