/**
 * Unit tests for src/modules/auth/login-attempts.ts
 *
 * All Redis interaction is mocked via a fake client backed by a Map so these
 * tests run without a real Redis instance. Tests are grouped by exported
 * function and cover the full behaviour contract including boundary conditions
 * and case-insensitivity.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkLoginAttempts,
  recordFailedAttempt,
  clearLoginAttempts,
  isLockoutThreshold,
  MAX_ATTEMPTS,
  LOCKOUT_WINDOW_SECONDS,
} from "./login-attempts.js";
import { TooManyRequestsError } from "../../lib/errors.js";

function makeMockRedis() {
  const store = new Map<string, string>();

  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    incr: vi.fn(async (key: string) => {
      const val = parseInt(store.get(key) ?? "0", 10) + 1;
      store.set(key, String(val));
      return val;
    }),
    expire: vi.fn(async (_key: string, _ttl: number) => 1),
    del: vi.fn(async (key: string) => {
      const had = store.delete(key);
      return had ? 1 : 0;
    }),
  };
}

describe("checkLoginAttempts()", () => {
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    redis = makeMockRedis();
  });

  it("does not throw when no attempts are recorded", async () => {
    await expect(
      checkLoginAttempts(redis as never, "user@test.com"),
    ).resolves.toBeUndefined();
  });

  it("does not throw when attempt count is one below MAX_ATTEMPTS", async () => {
    redis.store.set("login_attempts:user@test.com", String(MAX_ATTEMPTS - 1));
    await expect(
      checkLoginAttempts(redis as never, "user@test.com"),
    ).resolves.toBeUndefined();
  });

  it("throws TooManyRequestsError when attempt count equals MAX_ATTEMPTS", async () => {
    redis.store.set("login_attempts:user@test.com", String(MAX_ATTEMPTS));
    await expect(
      checkLoginAttempts(redis as never, "user@test.com"),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("throws TooManyRequestsError when attempt count exceeds MAX_ATTEMPTS", async () => {
    redis.store.set("login_attempts:user@test.com", String(MAX_ATTEMPTS + 3));
    await expect(
      checkLoginAttempts(redis as never, "user@test.com"),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("is case-insensitive for the email key", async () => {
    redis.store.set("login_attempts:user@test.com", String(MAX_ATTEMPTS));
    await expect(
      checkLoginAttempts(redis as never, "User@TEST.com"),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it("error message is the uniform 'Credenciais inválidas.' (no user enumeration)", async () => {
    redis.store.set("login_attempts:user@test.com", String(MAX_ATTEMPTS));
    await expect(
      checkLoginAttempts(redis as never, "user@test.com"),
    ).rejects.toThrow("Credenciais inválidas.");
  });

  it("TooManyRequestsError has statusCode 429", async () => {
    redis.store.set("login_attempts:user@test.com", String(MAX_ATTEMPTS));
    try {
      await checkLoginAttempts(redis as never, "user@test.com");
    } catch (err) {
      expect((err as TooManyRequestsError).statusCode).toBe(429);
    }
  });

  it("TooManyRequestsError isOperational is true (expected business error)", async () => {
    redis.store.set("login_attempts:user@test.com", String(MAX_ATTEMPTS));
    try {
      await checkLoginAttempts(redis as never, "user@test.com");
    } catch (err) {
      expect((err as TooManyRequestsError).isOperational).toBe(true);
    }
  });
});

describe("recordFailedAttempt()", () => {
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    redis = makeMockRedis();
  });

  it("returns 1 on the first failed attempt", async () => {
    const count = await recordFailedAttempt(redis as never, "user@test.com");
    expect(count).toBe(1);
  });

  it("calls redis.expire with LOCKOUT_WINDOW_SECONDS on the first attempt only", async () => {
    await recordFailedAttempt(redis as never, "user@test.com");
    expect(redis.expire).toHaveBeenCalledOnce();
    expect(redis.expire).toHaveBeenCalledWith(
      "login_attempts:user@test.com",
      LOCKOUT_WINDOW_SECONDS,
    );
  });

  it("does NOT call redis.expire on subsequent attempts (fixed-window, TTL set once)", async () => {
    await recordFailedAttempt(redis as never, "user@test.com");
    await recordFailedAttempt(redis as never, "user@test.com");
    await recordFailedAttempt(redis as never, "user@test.com");
    expect(redis.expire).toHaveBeenCalledOnce();
  });

  it("increments the counter on each call", async () => {
    expect(await recordFailedAttempt(redis as never, "user@test.com")).toBe(1);
    expect(await recordFailedAttempt(redis as never, "user@test.com")).toBe(2);
    expect(await recordFailedAttempt(redis as never, "user@test.com")).toBe(3);
  });

  it("increments up through and past MAX_ATTEMPTS", async () => {
    for (let i = 1; i <= MAX_ATTEMPTS + 1; i++) {
      const count = await recordFailedAttempt(redis as never, "user@test.com");
      expect(count).toBe(i);
    }
  });

  it("is case-insensitive: lowercases the email before writing the key", async () => {
    await recordFailedAttempt(redis as never, "User@TEST.com");
    expect(redis.store.get("login_attempts:user@test.com")).toBe("1");
    expect(redis.store.has("login_attempts:User@TEST.com")).toBe(false);
  });

  it("different emails maintain independent counters", async () => {
    await recordFailedAttempt(redis as never, "alice@test.com");
    await recordFailedAttempt(redis as never, "alice@test.com");
    await recordFailedAttempt(redis as never, "bob@test.com");

    expect(redis.store.get("login_attempts:alice@test.com")).toBe("2");
    expect(redis.store.get("login_attempts:bob@test.com")).toBe("1");
  });
});

describe("clearLoginAttempts()", () => {
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    redis = makeMockRedis();
  });

  it("deletes the counter key when it exists", async () => {
    redis.store.set("login_attempts:user@test.com", "3");
    await clearLoginAttempts(redis as never, "user@test.com");
    expect(redis.store.has("login_attempts:user@test.com")).toBe(false);
  });

  it("calls redis.del exactly once", async () => {
    redis.store.set("login_attempts:user@test.com", "1");
    await clearLoginAttempts(redis as never, "user@test.com");
    expect(redis.del).toHaveBeenCalledOnce();
  });

  it("is a no-op (no throw) when no counter exists", async () => {
    await expect(
      clearLoginAttempts(redis as never, "nobody@test.com"),
    ).resolves.toBeUndefined();
  });

  it("is case-insensitive: deletes the lowercased key", async () => {
    redis.store.set("login_attempts:user@test.com", "2");
    await clearLoginAttempts(redis as never, "User@TEST.com");
    expect(redis.store.has("login_attempts:user@test.com")).toBe(false);
  });

  it("resolves undefined after deleting", async () => {
    redis.store.set("login_attempts:user@test.com", "4");
    const result = await clearLoginAttempts(redis as never, "user@test.com");
    expect(result).toBeUndefined();
  });
});

describe("isLockoutThreshold()", () => {
  it("returns true when count equals MAX_ATTEMPTS (the crossing point)", () => {
    expect(isLockoutThreshold(MAX_ATTEMPTS)).toBe(true);
  });

  it("returns false when count is one below MAX_ATTEMPTS", () => {
    expect(isLockoutThreshold(MAX_ATTEMPTS - 1)).toBe(false);
  });

  it("returns false when count is two below MAX_ATTEMPTS", () => {
    expect(isLockoutThreshold(MAX_ATTEMPTS - 2)).toBe(false);
  });

  it("returns false when count is 1 (first attempt)", () => {
    expect(isLockoutThreshold(1)).toBe(false);
  });

  it("returns false when count exceeds MAX_ATTEMPTS (already locked — crossing already recorded)", () => {
    expect(isLockoutThreshold(MAX_ATTEMPTS + 1)).toBe(false);
  });

  it("returns false for count = 0 (no attempts)", () => {
    expect(isLockoutThreshold(0)).toBe(false);
  });
});

describe("exported constants", () => {
  it("MAX_ATTEMPTS is 5", () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it("LOCKOUT_WINDOW_SECONDS is 900 (15 minutes)", () => {
    expect(LOCKOUT_WINDOW_SECONDS).toBe(900);
  });
});
