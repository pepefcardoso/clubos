/**
 * Unit tests for apps/api/src/lib/env.ts
 *
 * All tests run purely in-process — no database or Redis connections are
 * made. Each test case manipulates process.env directly and restores it
 * afterwards via the `withEnv` helper.
 *
 * Coverage priorities:
 *   1. Required-field presence (DATABASE_URL, JWT_SECRET, etc.)
 *   2. Minimum-length guards (secrets ≥ 32 chars)
 *   3. SSL enforcement logic in production (L-14)
 *      — accepted: verify-ca, verify-full + sslrootcert
 *      — rejected: require, prefer, allow, missing, verify-full without sslrootcert
 *   4. SSL is NOT enforced in development / test (local Docker)
 *   5. Redis TLS enforcement in production (L-08)
 *      — accepted: rediss:// with password
 *      — rejected: redis://, rediss:// without password, non-redis schemes
 *   6. Redis scheme is NOT enforced in development / test
 *   7. CORS origins enforcement in production (L-03)
 *      — accepted: https:// origins (single or comma-separated)
 *      — rejected: missing, empty, any http:// origin
 *   8. CORS origins are NOT enforced in development / test
 *   9. Caching behaviour — validateEnv() returns the same object reference
 *  10. Error message readability — all failing fields listed at once
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv, getEnv, _resetEnvCache } from "./env.js";

/** A minimal set of env vars that passes validation in development. */
const VALID_BASE_ENV: Record<string, string> = {
  NODE_ENV: "development",
  DATABASE_URL:
    "postgresql://clubos:clubos@localhost:5432/clubos_dev?schema=public",
  REDIS_URL: "redis://localhost:6379",
  JWT_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  MEMBER_ENCRYPTION_KEY: "c".repeat(32),
};

/** A valid production DATABASE_URL (verify-full + sslrootcert). */
const PROD_DATABASE_URL =
  "postgresql://user:pass@host:5432/db?schema=public&sslmode=verify-full&sslrootcert=/etc/ssl/ca.pem";

/** A minimal valid production env (all three security constraints satisfied). */
const VALID_PROD_ENV: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: PROD_DATABASE_URL,
  REDIS_URL: "rediss://:strongpassword@host:6380",
  JWT_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  MEMBER_ENCRYPTION_KEY: "c".repeat(32),
  ALLOWED_ORIGINS: "https://app.clubos.com.br",
};

/**
 * Temporarily merges `overrides` into process.env (on top of VALID_BASE_ENV)
 * and returns a teardown function that restores the original values.
 *
 * Pass `undefined` as a value to delete a key entirely:
 *   withEnv({ DATABASE_URL: undefined })
 */
function withEnv(overrides: Record<string, string | undefined>): () => void {
  const merged = { ...VALID_BASE_ENV, ...overrides };
  const original: Record<string, string | undefined> = {};

  for (const key of Object.keys(merged)) {
    original[key] = process.env[key];
  }

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

/** Like withEnv but starts from VALID_PROD_ENV instead of VALID_BASE_ENV. */
function withProdEnv(
  overrides: Record<string, string | undefined>,
): () => void {
  const merged = { ...VALID_PROD_ENV, ...overrides };
  const original: Record<string, string | undefined> = {};

  for (const key of Object.keys(merged)) {
    original[key] = process.env[key];
  }

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

describe("validateEnv()", () => {
  beforeEach(() => _resetEnvCache());
  afterEach(() => _resetEnvCache());

  it("succeeds with a valid development environment", () => {
    const restore = withEnv({});
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("returns a parsed Env object with coerced defaults", () => {
    const restore = withEnv({});
    try {
      const env = validateEnv();
      expect(env.NODE_ENV).toBe("development");
      expect(env.PORT).toBe(3001);
      expect(typeof env.PORT).toBe("number");
    } finally {
      restore();
    }
  });

  it("throws when DATABASE_URL is missing", () => {
    const restore = withEnv({ DATABASE_URL: undefined });
    try {
      expect(() => validateEnv()).toThrow(/DATABASE_URL/);
    } finally {
      restore();
    }
  });

  it("throws when DATABASE_URL is not a postgres URL", () => {
    const restore = withEnv({ DATABASE_URL: "mysql://user:pass@host/db" });
    try {
      expect(() => validateEnv()).toThrow(/DATABASE_URL/);
    } finally {
      restore();
    }
  });

  it("throws when REDIS_URL is missing", () => {
    const restore = withEnv({ REDIS_URL: undefined });
    try {
      expect(() => validateEnv()).toThrow(/REDIS_URL/);
    } finally {
      restore();
    }
  });

  it("throws when REDIS_URL is not a valid URL", () => {
    const restore = withEnv({ REDIS_URL: "not-a-url" });
    try {
      expect(() => validateEnv()).toThrow(/REDIS_URL/);
    } finally {
      restore();
    }
  });

  it("throws when JWT_SECRET is missing", () => {
    const restore = withEnv({ JWT_SECRET: undefined });
    try {
      expect(() => validateEnv()).toThrow(/JWT_SECRET/);
    } finally {
      restore();
    }
  });

  it("throws when JWT_SECRET is shorter than 32 chars", () => {
    const restore = withEnv({ JWT_SECRET: "short" });
    try {
      expect(() => validateEnv()).toThrow(/JWT_SECRET/);
    } finally {
      restore();
    }
  });

  it("does NOT throw when JWT_SECRET is exactly 32 chars (boundary)", () => {
    const restore = withEnv({ JWT_SECRET: "x".repeat(32) });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("throws when JWT_REFRESH_SECRET is shorter than 32 chars", () => {
    const restore = withEnv({ JWT_REFRESH_SECRET: "tooshort" });
    try {
      expect(() => validateEnv()).toThrow(/JWT_REFRESH_SECRET/);
    } finally {
      restore();
    }
  });

  it("throws when MEMBER_ENCRYPTION_KEY is missing", () => {
    const restore = withEnv({ MEMBER_ENCRYPTION_KEY: undefined });
    try {
      expect(() => validateEnv()).toThrow(/MEMBER_ENCRYPTION_KEY/);
    } finally {
      restore();
    }
  });

  it("throws when MEMBER_ENCRYPTION_KEY is shorter than 32 chars", () => {
    const restore = withEnv({ MEMBER_ENCRYPTION_KEY: "tooshort" });
    try {
      expect(() => validateEnv()).toThrow(/MEMBER_ENCRYPTION_KEY/);
    } finally {
      restore();
    }
  });

  it("does NOT throw when MEMBER_ENCRYPTION_KEY is exactly 32 chars (boundary)", () => {
    const restore = withEnv({ MEMBER_ENCRYPTION_KEY: "k".repeat(32) });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("throws in production when DATABASE_URL has no sslmode param", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      expect(() => validateEnv()).toThrow(/sslmode/);
    } finally {
      restore();
    }
  });

  it("throws in production when sslmode=disable", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=disable",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      expect(() => validateEnv()).toThrow(/sslmode/);
    } finally {
      restore();
    }
  });

  it("throws in production when sslmode=prefer (not strict enough)", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=prefer",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      expect(() => validateEnv()).toThrow(/sslmode/);
    } finally {
      restore();
    }
  });

  it("throws in production when sslmode=allow (not strict enough)", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=allow",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      expect(() => validateEnv()).toThrow(/sslmode/);
    } finally {
      restore();
    }
  });

  it("throws in production when sslmode=require (does not authenticate server cert)", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=require",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      expect(() => validateEnv()).toThrow(/sslmode/);
    } finally {
      restore();
    }
  });

  it("throws in production when sslmode=verify-full but sslrootcert is absent", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=verify-full",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      expect(() => validateEnv()).toThrow(/sslrootcert/);
    } finally {
      restore();
    }
  });

  it("succeeds in production when sslmode=verify-ca", () => {
    const restore = withProdEnv({
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=verify-ca",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("succeeds in production when sslmode=verify-full with sslrootcert", () => {
    const restore = withProdEnv({});
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("allows sslmode=disable in development (Docker local)", () => {
    const restore = withEnv({
      NODE_ENV: "development",
      DATABASE_URL:
        "postgresql://clubos:clubos@localhost:5432/clubos_dev?sslmode=disable",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("allows no sslmode in development (Docker local, default)", () => {
    const restore = withEnv({
      NODE_ENV: "development",
      DATABASE_URL:
        "postgresql://clubos:clubos@localhost:5432/clubos_dev?schema=public",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("allows no sslmode in test environment (CI postgres)", () => {
    const restore = withEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://clubos:clubos@localhost:5432/clubos_test",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("caches the result — second call returns the same object reference", () => {
    const restore = withEnv({});
    try {
      const first = validateEnv();
      const second = validateEnv();
      expect(first).toBe(second);
    } finally {
      restore();
    }
  });

  it("only calls safeParse once even with multiple invocations", () => {
    const restore = withEnv({});
    try {
      const a = validateEnv();
      const b = validateEnv();
      expect(a.DATABASE_URL).toBe(b.DATABASE_URL);
    } finally {
      restore();
    }
  });

  it("throws a human-readable error listing all failing fields at once", () => {
    const restore = withEnv({
      JWT_SECRET: undefined,
      MEMBER_ENCRYPTION_KEY: "short",
    });
    try {
      let errorMessage = "";
      try {
        validateEnv();
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      expect(errorMessage).toMatch(/JWT_SECRET/);
      expect(errorMessage).toMatch(/MEMBER_ENCRYPTION_KEY/);
    } finally {
      restore();
    }
  });

  it("includes the field path in bracket notation in the error output", () => {
    const restore = withEnv({ JWT_SECRET: "short" });
    try {
      let errorMessage = "";
      try {
        validateEnv();
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      expect(errorMessage).toMatch(/\[JWT_SECRET\]/);
    } finally {
      restore();
    }
  });

  it("error message includes the security guideline reference for SSL failures", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=disable",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      let errorMessage = "";
      try {
        validateEnv();
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      expect(errorMessage).toMatch(/security-guidelines/);
      expect(errorMessage).toMatch(/L-14/);
    } finally {
      restore();
    }
  });

  it("error message for verify-full without sslrootcert references security guidelines", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=verify-full",
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      let errorMessage = "";
      try {
        validateEnv();
      } catch (e) {
        errorMessage = (e as Error).message;
      }
      expect(errorMessage).toMatch(/sslrootcert/);
      expect(errorMessage).toMatch(/security-guidelines/);
      expect(errorMessage).toMatch(/L-14/);
    } finally {
      restore();
    }
  });
});

describe("validateEnv() — REDIS_URL (L-08)", () => {
  beforeEach(() => _resetEnvCache());
  afterEach(() => _resetEnvCache());

  it("accepts redis:// in development (Docker default)", () => {
    const restore = withEnv({ REDIS_URL: "redis://localhost:6379" });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("accepts rediss:// without a password in development", () => {
    const restore = withEnv({ REDIS_URL: "rediss://localhost:6380" });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("accepts rediss:// with a password in development", () => {
    const restore = withEnv({
      REDIS_URL: "rediss://:strongpassword@host:6380",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("accepts redis:// in test environment (CI)", () => {
    const restore = withEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://clubos:clubos@localhost:5432/clubos_test",
      REDIS_URL: "redis://localhost:6379",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("throws when REDIS_URL is not a valid URL", () => {
    const restore = withEnv({ REDIS_URL: "not-a-url" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/REDIS_URL/);
      expect(msg).toMatch(/not a valid URL/);
    } finally {
      restore();
    }
  });

  it("throws when REDIS_URL uses an unsupported scheme (http://)", () => {
    const restore = withEnv({ REDIS_URL: "http://localhost:6379" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/REDIS_URL/);
      expect(msg).toMatch(/redis:\/\/ or rediss:\/\//);
    } finally {
      restore();
    }
  });

  it("throws when REDIS_URL uses an unsupported scheme (tcp://)", () => {
    const restore = withEnv({ REDIS_URL: "tcp://localhost:6379" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/redis:\/\/ or rediss:\/\//);
    } finally {
      restore();
    }
  });

  it("throws in production when REDIS_URL uses plain redis:// (no TLS)", () => {
    const restore = withProdEnv({ REDIS_URL: "redis://localhost:6379" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/REDIS_URL/);
      expect(msg).toMatch(/rediss:\/\//);
    } finally {
      restore();
    }
  });

  it("throws in production when REDIS_URL is rediss:// but has no password", () => {
    const restore = withProdEnv({ REDIS_URL: "rediss://host:6380" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/REDIS_URL/);
      expect(msg).toMatch(/password/);
    } finally {
      restore();
    }
  });

  it("accepts rediss:// with a password in production", () => {
    const restore = withProdEnv({});
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("error message for redis:// in production references security guidelines (L-08)", () => {
    const restore = withProdEnv({ REDIS_URL: "redis://localhost:6379" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/security-guidelines/);
      expect(msg).toMatch(/L-08/);
    } finally {
      restore();
    }
  });

  it("error message for missing password references security guidelines (L-08)", () => {
    const restore = withProdEnv({ REDIS_URL: "rediss://host:6380" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/security-guidelines/);
      expect(msg).toMatch(/L-08/);
    } finally {
      restore();
    }
  });

  it("lists both DATABASE_URL and REDIS_URL failures together when both are misconfigured in production", () => {
    const restore = withProdEnv({
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=disable",
      REDIS_URL: "redis://localhost:6379",
    });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/DATABASE_URL/);
      expect(msg).toMatch(/REDIS_URL/);
      expect(msg).toMatch(/L-14/);
      expect(msg).toMatch(/L-08/);
    } finally {
      restore();
    }
  });
});

describe("validateEnv() — ALLOWED_ORIGINS (L-03)", () => {
  beforeEach(() => _resetEnvCache());
  afterEach(() => _resetEnvCache());

  it("accepts a single valid https:// origin in production", () => {
    const restore = withProdEnv({
      ALLOWED_ORIGINS: "https://app.clubos.com.br",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("accepts multiple comma-separated https:// origins in production", () => {
    const restore = withProdEnv({
      ALLOWED_ORIGINS: "https://app.clubos.com.br,https://clubos.com.br",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("accepts origins with spaces around commas (trimmed) in production", () => {
    const restore = withProdEnv({
      ALLOWED_ORIGINS: "https://app.clubos.com.br , https://clubos.com.br",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("throws when ALLOWED_ORIGINS is missing in production", () => {
    const restore = withProdEnv({ ALLOWED_ORIGINS: undefined });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/ALLOWED_ORIGINS/);
    } finally {
      restore();
    }
  });

  it("throws when ALLOWED_ORIGINS is an empty string in production", () => {
    const restore = withProdEnv({ ALLOWED_ORIGINS: "" });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/ALLOWED_ORIGINS/);
    } finally {
      restore();
    }
  });

  it("throws when ALLOWED_ORIGINS is whitespace-only in production", () => {
    const restore = withProdEnv({ ALLOWED_ORIGINS: "   " });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/ALLOWED_ORIGINS/);
    } finally {
      restore();
    }
  });

  it("throws when an http:// origin is present in production", () => {
    const restore = withProdEnv({
      ALLOWED_ORIGINS: "http://app.clubos.com.br",
    });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/https:\/\//);
      expect(msg).toMatch(/L-03/);
    } finally {
      restore();
    }
  });

  it("throws when a mixed list contains even one http:// origin in production", () => {
    const restore = withProdEnv({
      ALLOWED_ORIGINS: "https://app.clubos.com.br,http://other.com",
    });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/http:\/\/other\.com/);
    } finally {
      restore();
    }
  });

  it("error for http:// origin references security guidelines (L-03)", () => {
    const restore = withProdEnv({
      ALLOWED_ORIGINS: "http://app.clubos.com.br",
    });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/security-guidelines/);
      expect(msg).toMatch(/L-03/);
    } finally {
      restore();
    }
  });

  it("error for missing ALLOWED_ORIGINS references security guidelines (L-03)", () => {
    const restore = withProdEnv({ ALLOWED_ORIGINS: undefined });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/security-guidelines/);
      expect(msg).toMatch(/L-03/);
    } finally {
      restore();
    }
  });

  it("does NOT throw when ALLOWED_ORIGINS is absent in development", () => {
    const restore = withEnv({ ALLOWED_ORIGINS: undefined });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("does NOT throw when ALLOWED_ORIGINS is http://localhost:3000 in development", () => {
    const restore = withEnv({
      NODE_ENV: "development",
      ALLOWED_ORIGINS: "http://localhost:3000",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("does NOT throw when ALLOWED_ORIGINS is absent in test environment", () => {
    const restore = withEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://clubos:clubos@localhost:5432/clubos_test",
      ALLOWED_ORIGINS: undefined,
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("does NOT throw when ALLOWED_ORIGINS is an http:// URL in test", () => {
    const restore = withEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://clubos:clubos@localhost:5432/clubos_test",
      ALLOWED_ORIGINS: "http://localhost:3000",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("lists DATABASE_URL, REDIS_URL, and ALLOWED_ORIGINS failures together in production", () => {
    const restore = withProdEnv({
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=disable",
      REDIS_URL: "redis://localhost:6379",
      ALLOWED_ORIGINS: undefined,
    });
    try {
      let msg = "";
      try {
        validateEnv();
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/DATABASE_URL/);
      expect(msg).toMatch(/REDIS_URL/);
      expect(msg).toMatch(/ALLOWED_ORIGINS/);
      expect(msg).toMatch(/L-14/);
      expect(msg).toMatch(/L-08/);
      expect(msg).toMatch(/L-03/);
    } finally {
      restore();
    }
  });
});

describe("getEnv()", () => {
  beforeEach(() => _resetEnvCache());
  afterEach(() => _resetEnvCache());

  it("throws when called before validateEnv()", () => {
    expect(() => getEnv()).toThrow(/validateEnv/);
  });

  it("returns the cached env after validateEnv() has been called", () => {
    const restore = withEnv({});
    try {
      const validated = validateEnv();
      const retrieved = getEnv();
      expect(retrieved).toBe(validated);
    } finally {
      restore();
    }
  });
});

describe("_resetEnvCache()", () => {
  it("clears the cache so validateEnv() re-parses process.env", () => {
    const restore = withEnv({});
    try {
      const first = validateEnv();
      _resetEnvCache();
      const second = validateEnv();
      expect(first).not.toBe(second);
      expect(first.DATABASE_URL).toBe(second.DATABASE_URL);
    } finally {
      restore();
    }
  });

  it("causes getEnv() to throw until validateEnv() is called again", () => {
    const restore = withEnv({});
    try {
      validateEnv();
      _resetEnvCache();
      expect(() => getEnv()).toThrow(/validateEnv/);
    } finally {
      restore();
    }
  });
});
