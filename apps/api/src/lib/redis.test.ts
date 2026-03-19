import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
  _isAuthError,
} from "../lib/redis.js";

function makeMockRedis() {
  const store = new Map<string, string>();

  return {
    store,
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        if (store.delete(key)) deleted++;
      }
      return deleted;
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    pipeline: vi.fn(function (this: ReturnType<typeof makeMockRedis>) {
      const ops: Array<() => Promise<[null, unknown]>> = [];
      const pipe = {
        get: (key: string) => {
          ops.push(async () => [null, store.get(key) ?? null]);
          return pipe;
        },
        del: (key: string) => {
          ops.push(async () => {
            const existed = store.delete(key);
            return [null, existed ? 1 : 0];
          });
          return pipe;
        },
        exec: async () => {
          const results: Array<[null, unknown]> = [];
          for (const op of ops) {
            results.push(await op());
          }
          return results;
        },
      };
      return pipe;
    }),
  };
}

type MockRedis = ReturnType<typeof makeMockRedis>;

describe("storeRefreshToken", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = makeMockRedis();
  });

  it("stores the userId under refresh_token:{jti}", async () => {
    await storeRefreshToken(redis as never, "test-jti", "user-123");
    expect(redis.set).toHaveBeenCalledWith(
      "refresh_token:test-jti",
      "user-123",
      "EX",
      604800,
    );
  });
});

describe("consumeRefreshToken", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = makeMockRedis();
  });

  it("returns the userId and removes the key on first call", async () => {
    redis.store.set("refresh_token:jti-abc", "user-456");

    const userId = await consumeRefreshToken(redis as never, "jti-abc");

    expect(userId).toBe("user-456");
    expect(redis.store.has("refresh_token:jti-abc")).toBe(false);
  });

  it("returns null when the token does not exist (already rotated)", async () => {
    const userId = await consumeRefreshToken(redis as never, "nonexistent-jti");
    expect(userId).toBeNull();
  });

  it("returns null on the second call (single-use enforcement)", async () => {
    redis.store.set("refresh_token:jti-xyz", "user-789");

    await consumeRefreshToken(redis as never, "jti-xyz");
    const second = await consumeRefreshToken(redis as never, "jti-xyz");

    expect(second).toBeNull();
  });
});

describe("revokeRefreshToken", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = makeMockRedis();
  });

  it("deletes the key from Redis", async () => {
    redis.store.set("refresh_token:jti-revoke", "user-000");

    await revokeRefreshToken(redis as never, "jti-revoke");

    expect(redis.del).toHaveBeenCalledWith("refresh_token:jti-revoke");
    expect(redis.store.has("refresh_token:jti-revoke")).toBe(false);
  });

  it("is a no-op when the key does not exist", async () => {
    await expect(
      revokeRefreshToken(redis as never, "never-existed"),
    ).resolves.toBeUndefined();
  });
});

describe("_isAuthError", () => {
  it("returns true for WRONGPASS errors", () => {
    expect(
      _isAuthError(new Error("WRONGPASS invalid username-password pair")),
    ).toBe(true);
  });

  it("returns true for NOAUTH errors", () => {
    expect(_isAuthError(new Error("NOAUTH Authentication required"))).toBe(
      true,
    );
  });

  it("returns true for ERR invalid password", () => {
    expect(_isAuthError(new Error("ERR invalid password"))).toBe(true);
  });

  it("returns true for 'invalid username-password pair' wording", () => {
    expect(
      _isAuthError(
        new Error("invalid username-password pair or user is disabled."),
      ),
    ).toBe(true);
  });

  it("returns false for ECONNREFUSED (transient network error)", () => {
    expect(_isAuthError(new Error("connect ECONNREFUSED 127.0.0.1:6379"))).toBe(
      false,
    );
  });

  it("returns false for ETIMEDOUT", () => {
    expect(_isAuthError(new Error("connect ETIMEDOUT"))).toBe(false);
  });

  it("returns false for generic errors", () => {
    expect(_isAuthError(new Error("Something went wrong"))).toBe(false);
  });

  it("returns false for an empty message", () => {
    expect(_isAuthError(new Error(""))).toBe(false);
  });
});

describe("getRedisClient() auth-error handling", () => {
  it("calls process.exit(1) when the Redis error event fires with a WRONGPASS error", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: number | string | null | undefined) => {
        throw new Error("process.exit called");
      });

    const { EventEmitter } = await import("events");
    const emitter = new EventEmitter();

    const connectError = new Error("WRONGPASS invalid username-password pair");

    const { _isAuthError: isAuth } = await import("../lib/redis.js");

    const handler = (err: Error) => {
      if (isAuth(err)) {
        console.error(
          "[Redis] Authentication failed. Check REDIS_URL password. Process will exit.",
          err.message,
        );
        process.exit(1);
      }
    };

    emitter.on("error", handler);

    expect(() => emitter.emit("error", connectError)).toThrow(
      "process.exit called",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("does NOT call process.exit(1) when the error event fires with a transient network error", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: number | string | null | undefined) => {
        throw new Error("process.exit called");
      });

    const { EventEmitter } = await import("events");
    const emitter = new EventEmitter();

    const { _isAuthError: isAuth } = await import("../lib/redis.js");

    const handler = (err: Error) => {
      if (isAuth(err)) {
        process.exit(1);
      }
    };

    emitter.on("error", handler);
    expect(() =>
      emitter.emit("error", new Error("ECONNREFUSED")),
    ).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
