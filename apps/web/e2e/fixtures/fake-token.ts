/**
 * Builds a fake JWT access token that passes decodeUserFromToken().
 *
 * The client-side auth context decodes the JWT payload without verifying the
 * signature — signature verification is the server's responsibility. This
 * means we can construct a deterministic token for tests without needing the
 * JWT_SECRET at all.
 *
 * NEVER use this outside of E2E test context.
 */
export function buildFakeAccessToken(
  overrides: {
    sub?: string;
    clubId?: string;
    role?: "ADMIN" | "TREASURER" | "PHYSIO";
  } = {},
): string {
  const b64url = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const header = b64url({ alg: "HS256", typ: "JWT" });

  const now = Math.floor(Date.now() / 1000);
  const payload = b64url({
    sub: overrides.sub ?? "user-e2e-admin-001",
    clubId: overrides.clubId ?? "club-e2e-001",
    role: overrides.role ?? "ADMIN",
    type: "access",
    iat: now,
    exp: now + 900,
  });

  const sig = "e2e-fake-signature";

  return `${header}.${payload}.${sig}`;
}

export const ADMIN_TOKEN = buildFakeAccessToken({ role: "ADMIN" });
export const TREASURER_TOKEN = buildFakeAccessToken({ role: "TREASURER" });
export const PHYSIO_TOKEN = buildFakeAccessToken({ role: "PHYSIO" });
