import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRouteRateLimit } from "./route-rate-limit.js";

function makeMockRedis() {
  const zsets = new Map<string, Map<string, number>>();

  const getOrCreate = (key: string): Map<string, number> => {
    if (!zsets.has(key)) zsets.set(key, new Map());
    return zsets.get(key)!;
  };

  return {
    _zsets: zsets,

    eval: vi.fn(
      async (_script: string, _numKeys: number, ...args: string[]) => {
        const key = args[0]!;
        const windowStart = Number(args[1]);
        const now = Number(args[2]);
        const limit = Number(args[3]);
        const member = args[5]!;

        const zset = getOrCreate(key);

        for (const [m, score] of zset) {
          if (score <= windowStart) zset.delete(m);
        }

        const current = zset.size;

        if (current >= limit) {
          const scores = Array.from(zset.values());
          const oldest = scores.length > 0 ? Math.min(...scores) : now;
          return [0, current, oldest];
        }

        zset.set(member, now);
        return [1, current + 1, 0];
      },
    ),
  };
}

type MockRedis = ReturnType<typeof makeMockRedis>;

const KEY_A = "pos:club-aaaa";
const KEY_B = "pos:club-bbbb";
const KEY_EVENT_A = "ticket-purchase:event-aaaa";
const KEY_EVENT_B = "ticket-purchase:event-bbbb";
const MAX = 10;
const WINDOW_MS = 60_000;

function seedEntries(redis: MockRedis, key: string, count: number, at: number) {
  const zset = redis._zsets.get(key) ?? new Map<string, number>();
  for (let i = 0; i < count; i++) {
    zset.set(`seed-${at}-${i}`, at);
  }
  redis._zsets.set(key, zset);
}

describe("checkRouteRateLimit", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = makeMockRedis();
    vi.clearAllMocks();
  });

  it("RRL-1: allows first request when no key exists", async () => {
    const result = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(MAX);
    expect(result.retryAfterMs).toBe(0);
  });

  it("RRL-2: allows the Nth request (count max-1 → max)", async () => {
    seedEntries(redis, KEY_A, MAX - 1, Date.now());
    const result = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(MAX);
  });

  it("RRL-3: rejects the (max+1)th request", async () => {
    seedEntries(redis, KEY_A, MAX, Date.now());
    const result = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(MAX);
  });

  it("RRL-4: retryAfterMs is positive and ≤ windowMs when rejected", async () => {
    seedEntries(redis, KEY_A, MAX, Date.now());
    const result = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
  });

  it("RRL-5: expired entries are excluded from window count", async () => {
    const expired = Date.now() - WINDOW_MS - 1;
    seedEntries(redis, KEY_A, MAX, expired);

    const result = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
  });

  it("RRL-6: current reflects count after consuming the slot", async () => {
    seedEntries(redis, KEY_A, 5, Date.now());
    const result = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );

    expect(result.current).toBe(6);
  });

  it("RRL-7: does not consume a slot when limit is already reached", async () => {
    seedEntries(redis, KEY_A, MAX, Date.now());
    await checkRouteRateLimit(redis as never, KEY_A, MAX, WINDOW_MS);

    expect(redis._zsets.get(KEY_A)!.size).toBe(MAX);
  });

  it("RRL-8: pos:clubA limit does not affect pos:clubB (per-club isolation)", async () => {
    seedEntries(redis, KEY_A, MAX, Date.now());

    const resultA = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );
    const resultB = await checkRouteRateLimit(
      redis as never,
      KEY_B,
      MAX,
      WINDOW_MS,
    );

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("RRL-9: ticket-purchase:eventA limit does not affect ticket-purchase:eventB", async () => {
    seedEntries(redis, KEY_EVENT_A, MAX, Date.now());

    const resultA = await checkRouteRateLimit(
      redis as never,
      KEY_EVENT_A,
      MAX,
      WINDOW_MS,
    );
    const resultB = await checkRouteRateLimit(
      redis as never,
      KEY_EVENT_B,
      MAX,
      WINDOW_MS,
    );

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("RRL-10: exactly max sequential calls all return allowed: true, (max+1)th is blocked", async () => {
    for (let i = 0; i < MAX; i++) {
      const result = await checkRouteRateLimit(
        redis as never,
        KEY_A,
        MAX,
        WINDOW_MS,
      );
      expect(result.allowed).toBe(true);
    }

    const overflow = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );
    expect(overflow.allowed).toBe(false);
  });

  it("RRL-11: after window expires, new requests are allowed again", async () => {
    const past = Date.now() - WINDOW_MS - 1;
    seedEntries(redis, KEY_A, MAX, past);

    const result = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      MAX,
      WINDOW_MS,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
  });

  it("RRL-12: respects different max values independently", async () => {
    seedEntries(redis, KEY_A, 5, Date.now());

    const tight = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      5,
      WINDOW_MS,
    );
    const loose = await checkRouteRateLimit(
      redis as never,
      KEY_A,
      20,
      WINDOW_MS,
    );

    expect(tight.allowed).toBe(false);
    expect(loose.allowed).toBe(true);
  });
});
