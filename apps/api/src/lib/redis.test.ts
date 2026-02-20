import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
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
