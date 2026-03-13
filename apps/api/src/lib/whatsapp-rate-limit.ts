import type { Redis } from "ioredis";

const WHATSAPP_RATE_LIMIT_MAX = 30;
const WHATSAPP_RATE_LIMIT_WINDOW_MS = 60_000;
const WHATSAPP_RATE_LIMIT_KEY_TTL_S = 120;

export interface RateLimitResult {
  /** Whether the caller is allowed to send. */
  allowed: boolean;
  /**
   * Number of messages recorded in the current window after this operation.
   * checkAndConsume: count *after* slot was consumed (if allowed).
   * check (read-only): count *before* any consumption.
   */
  current: number;
  /** The configured maximum (always 30). */
  limit: number;
  /**
   * Milliseconds until the oldest in-window entry expires and a slot opens up.
   * Only meaningful when `allowed === false`. Zero when `allowed === true`.
   */
  retryAfterMs: number;
}

function rateLimitKey(clubId: string): string {
  return `whatsapp_rate_limit:${clubId}`;
}

/**
 * Lua script for atomic check-and-consume.
 *
 * Why Lua? BullMQ workers run with up to 5 concurrent slots per architecture
 * rules. A plain check-then-ZADD would create a TOCTOU race where two workers
 * both read `current=29`, both decide to proceed, and push the count to 31.
 * Redis executes Lua scripts atomically — the same approach as @fastify/rate-limit.
 *
 * KEYS[1] — sorted set key  (`whatsapp_rate_limit:{clubId}`)
 * ARGV[1] — window_start    (now - 60_000, exclusive lower bound)
 * ARGV[2] — now             (current ms timestamp, used as score)
 * ARGV[3] — limit           (30)
 * ARGV[4] — ttl             (120 seconds)
 * ARGV[5] — member          (unique string for this attempt)
 *
 * Returns: [allowed (0|1), current_count, oldest_score (0 if allowed)]
 */
const CHECK_AND_CONSUME_LUA = `
local key          = KEYS[1]
local window_start = tonumber(ARGV[1])
local now          = tonumber(ARGV[2])
local limit        = tonumber(ARGV[3])
local ttl          = tonumber(ARGV[4])
local member       = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local current = redis.call('ZCARD', key)

if current >= limit then
  local oldest       = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_score = oldest[2] and tonumber(oldest[2]) or now
  return {0, current, oldest_score}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttl)
return {1, current + 1, 0}
`;

/**
 * Atomically checks the per-club WhatsApp rate limit **and** consumes one slot.
 *
 * Returns `allowed: true` and records the attempt when under the limit.
 * Returns `allowed: false` without consuming a slot when the limit is reached.
 *
 * **Job workers must call this before `sendWhatsAppMessage()`.**
 *
 * ```ts
 * const { allowed, retryAfterMs } = await checkAndConsumeWhatsAppRateLimit(redis, clubId);
 * if (!allowed) {
 *   throw new RateLimitExceededError(`Retry in ${retryAfterMs}ms`);
 * }
 * await sendWhatsAppMessage(prisma, input);
 * ```
 *
 * Redis key: `whatsapp_rate_limit:{clubId}` (ZSET, TTL 120s)
 *
 * @param redis  - Shared ioredis client from `getRedisClient()`.
 * @param clubId - Tenant identifier. Each club has its own independent bucket.
 */
export async function checkAndConsumeWhatsAppRateLimit(
  redis: Redis,
  clubId: string,
): Promise<RateLimitResult> {
  const key = rateLimitKey(clubId);
  const now = Date.now();
  const windowStart = now - WHATSAPP_RATE_LIMIT_WINDOW_MS;
  const member = `${now}-${Math.random().toString(36).slice(2, 9)}`;

  const result = (await redis.eval(
    CHECK_AND_CONSUME_LUA,
    1,
    key,
    String(windowStart),
    String(now),
    String(WHATSAPP_RATE_LIMIT_MAX),
    String(WHATSAPP_RATE_LIMIT_KEY_TTL_S),
    member,
  )) as [number, number, number];

  const [allowed, current, oldestScore] = result;

  const retryAfterMs =
    allowed === 0 && oldestScore > 0
      ? Math.max(0, oldestScore + WHATSAPP_RATE_LIMIT_WINDOW_MS - now)
      : 0;

  return {
    allowed: allowed === 1,
    current,
    limit: WHATSAPP_RATE_LIMIT_MAX,
    retryAfterMs,
  };
}

/**
 * Read-only check of the per-club WhatsApp rate limit. Does **not** consume a slot.
 *
 * Useful for pre-flight checks and monitoring. For the actual gate before
 * sending, always use `checkAndConsumeWhatsAppRateLimit()`.
 *
 * @param redis  - Shared ioredis client from `getRedisClient()`.
 * @param clubId - Tenant identifier.
 */
export async function checkWhatsAppRateLimit(
  redis: Redis,
  clubId: string,
): Promise<RateLimitResult> {
  const key = rateLimitKey(clubId);
  const now = Date.now();
  const windowStart = now - WHATSAPP_RATE_LIMIT_WINDOW_MS;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, "-inf", String(windowStart));
  pipeline.zcard(key);
  const results = await pipeline.exec();

  const current = (results?.[1]?.[1] as number | undefined) ?? 0;
  const allowed = current < WHATSAPP_RATE_LIMIT_MAX;

  let retryAfterMs = 0;
  if (!allowed) {
    const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
    const oldestScore = oldest[1] !== undefined ? Number(oldest[1]) : now;
    retryAfterMs = Math.max(
      0,
      oldestScore + WHATSAPP_RATE_LIMIT_WINDOW_MS - now,
    );
  }

  return {
    allowed,
    current,
    limit: WHATSAPP_RATE_LIMIT_MAX,
    retryAfterMs,
  };
}
