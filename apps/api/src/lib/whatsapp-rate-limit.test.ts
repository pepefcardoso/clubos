import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkAndConsumeWhatsAppRateLimit,
  checkWhatsAppRateLimit,
} from "./whatsapp-rate-limit.js";

function makeMockRedis() {
  const zsets = new Map<string, Map<string, number>>();

  /**
   * Only used by checkAndConsumeWhatsAppRateLimit (via eval / ZADD path).
   * Read-only helpers (pipeline) must NOT call this so they never create keys.
   */
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

    pipeline: vi.fn(() => {
      type Op = () => [null, unknown];
      const ops: Op[] = [];

      const pipe = {
        /**
         * RL-7 fix: use `zsets.get(key)` (not getOrCreate) so that
         * calling ZREMRANGEBYSCORE on a non-existent key never creates it.
         * This matches real Redis behaviour and keeps checkWhatsAppRateLimit
         * genuinely read-only with respect to key creation.
         */
        zremrangebyscore: (key: string, _min: string, max: string) => {
          ops.push(() => {
            const zset = zsets.get(key);
            if (zset) {
              for (const [m, score] of zset) {
                if (score <= Number(max)) zset.delete(m);
              }
            }
            return [null, 0];
          });
          return pipe;
        },
        /**
         * RL-7 fix: same rationale — return 0 for unknown keys without
         * touching the zsets map.
         */
        zcard: (key: string) => {
          ops.push(() => [null, zsets.get(key)?.size ?? 0]);
          return pipe;
        },
        exec: async () => ops.map((op) => op()),
      };
      return pipe;
    }),

    zrange: vi.fn(
      async (key: string, start: number, stop: number, withScores?: string) => {
        const zset = zsets.get(key);
        if (!zset) return [];
        const sorted = Array.from(zset.entries()).sort(([, a], [, b]) => a - b);
        const end = stop === -1 ? undefined : stop + 1;
        const slice = sorted.slice(start, end);
        if (withScores === "WITHSCORES") {
          return slice.flatMap(([m, s]) => [m, String(s)]);
        }
        return slice.map(([m]) => m);
      },
    ),
  };
}

type MockRedis = ReturnType<typeof makeMockRedis>;

const CLUB_A = "club-aaaaaaaaaaaaaaaaaaaaaa";
const CLUB_B = "club-bbbbbbbbbbbbbbbbbbbbbb";
const LIMIT = 30;
const WINDOW_MS = 60_000;

/** Populate the mock ZSET with `n` entries timestamped at `at`. */
function seedEntries(
  redis: MockRedis,
  clubId: string,
  count: number,
  at: number,
) {
  const key = `whatsapp_rate_limit:${clubId}`;
  const zset = redis._zsets.get(key) ?? new Map<string, number>();
  for (let i = 0; i < count; i++) {
    zset.set(`seed-${at}-${i}`, at);
  }
  redis._zsets.set(key, zset);
}

describe("checkAndConsumeWhatsAppRateLimit", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = makeMockRedis();
    vi.clearAllMocks();
  });

  it("RL-1: allows first message when no key exists (count 0 → 1)", async () => {
    const result = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
    expect(result.limit).toBe(LIMIT);
    expect(result.retryAfterMs).toBe(0);
  });

  it("RL-2: allows the 30th message (count 29 → 30)", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 29, now);

    const result = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(30);
  });

  it("RL-3: rejects the 31st message — returns allowed: false", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 30, now);

    const result = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );

    expect(result.allowed).toBe(false);
    expect(result.current).toBe(30);
  });

  it("RL-4: retryAfterMs is a positive number ≤ 60,000 when rejected", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 30, now);

    const result = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(WINDOW_MS);
  });

  it("RL-5: entries older than 60 s are excluded (sliding window cleanup)", async () => {
    const now = Date.now();
    const expired = now - WINDOW_MS - 1;
    seedEntries(redis, CLUB_A, 30, expired);

    const result = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
  });

  it("RL-6: current reflects actual count after consuming the slot", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 5, now);

    const result = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );

    expect(result.current).toBe(6);
  });

  it("RL-8: Club A and Club B limits are completely independent", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 30, now);

    const resultA = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );
    const resultB = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_B,
    );

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("RL-9: exactly 30 sequential calls all return allowed: true (boundary)", async () => {
    for (let i = 0; i < LIMIT; i++) {
      const result = await checkAndConsumeWhatsAppRateLimit(
        redis as never,
        CLUB_A,
      );
      expect(result.allowed).toBe(true);
    }

    const overflow = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );
    expect(overflow.allowed).toBe(false);
  });

  it("does not consume a slot when the limit is already reached", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 30, now);

    await checkAndConsumeWhatsAppRateLimit(redis as never, CLUB_A);

    const key = `whatsapp_rate_limit:${CLUB_A}`;
    const zset = redis._zsets.get(key)!;

    expect(zset.size).toBe(30);
  });
});

describe("checkWhatsAppRateLimit", () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = makeMockRedis();
    vi.clearAllMocks();
  });

  /**
   * RL-7: checkWhatsAppRateLimit is a read-only preflight check.
   * It must never create a Redis key that did not previously exist —
   * calling it on a club with zero history should leave _zsets empty.
   *
   * Root cause of the original failure: the pipeline mock's
   * zremrangebyscore called getOrCreate(), which unconditionally
   * inserted an empty Map into _zsets. Fixed by using zsets.get()
   * (a non-creating lookup) in both zremrangebyscore and zcard.
   */
  it("RL-7: read-only check does not consume a slot", async () => {
    await checkWhatsAppRateLimit(redis as never, CLUB_A);
    await checkWhatsAppRateLimit(redis as never, CLUB_A);
    await checkWhatsAppRateLimit(redis as never, CLUB_A);

    expect(redis._zsets.has(`whatsapp_rate_limit:${CLUB_A}`)).toBe(false);
  });

  it("returns allowed: true when under the limit", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 10, now);

    const result = await checkWhatsAppRateLimit(redis as never, CLUB_A);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(10);
    expect(result.limit).toBe(LIMIT);
  });

  it("returns allowed: false when at the limit", async () => {
    const now = Date.now();
    seedEntries(redis, CLUB_A, 30, now);

    const result = await checkWhatsAppRateLimit(redis as never, CLUB_A);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("counts 0 and allows when the key does not exist", async () => {
    const result = await checkWhatsAppRateLimit(redis as never, CLUB_A);

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
  });
});

describe("window expiry and reset", () => {
  it("RL-10: after the window expires, new messages are allowed again", async () => {
    const redis = makeMockRedis();
    const pastTimestamp = Date.now() - WINDOW_MS - 1;

    seedEntries(redis, CLUB_A, 30, pastTimestamp);

    const result = await checkAndConsumeWhatsAppRateLimit(
      redis as never,
      CLUB_A,
    );

    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
  });
});
