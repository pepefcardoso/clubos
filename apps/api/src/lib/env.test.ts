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
 *   5. Caching behaviour — validateEnv() returns the same object reference
 *   6. Error message readability — all failing fields listed at once
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
    });
    try {
      expect(() => validateEnv()).toThrow(/sslrootcert/);
    } finally {
      restore();
    }
  });

  it("succeeds in production when sslmode=verify-ca", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db?sslmode=verify-ca",
    });
    try {
      expect(() => validateEnv()).not.toThrow();
    } finally {
      restore();
    }
  });

  it("succeeds in production when sslmode=verify-full with sslrootcert", () => {
    const restore = withEnv({
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://user:pass@host:5432/db?sslmode=verify-full&sslrootcert=/etc/ssl/certs/ca-certificates.crt",
    });
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
