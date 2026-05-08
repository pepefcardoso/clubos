import type { Redis } from "ioredis";

export interface RouteRateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  retryAfterMs: number;
}

/**
 * Lua script for atomic check-and-consume.
 * Identical structure to whatsapp-rate-limit.ts — do not diverge.
 *
 * KEYS[1] — sorted set key
 * ARGV[1] — window_start (now - windowMs, exclusive lower bound)
 * ARGV[2] — now          (current ms timestamp, used as score)
 * ARGV[3] — limit
 * ARGV[4] — ttl_seconds  (key TTL; set to 2× the window)
 * ARGV[5] — member       (unique string for this attempt)
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
 * Atomically checks a named Redis sliding-window rate limit and consumes one slot.
 *
 * Returns `allowed: true` and records the attempt when under the limit.
 * Returns `allowed: false` without consuming a slot when the limit is reached.
 *
 * @param redis    - Shared ioredis client from `getRedisClient()`.
 * @param key      - Bucket key, e.g. `pos:{clubId}` or `ticket-purchase:{eventId}`.
 * @param max      - Maximum number of requests allowed within `windowMs`.
 * @param windowMs - Sliding window duration in milliseconds.
 */
export async function checkRouteRateLimit(
  redis: Redis,
  key: string,
  max: number,
  windowMs: number,
): Promise<RouteRateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2, 9)}`;
  const ttlSeconds = Math.ceil((windowMs * 2) / 1000);

  const result = (await redis.eval(
    CHECK_AND_CONSUME_LUA,
    1,
    key,
    String(windowStart),
    String(now),
    String(max),
    String(ttlSeconds),
    member,
  )) as [number, number, number];

  const [allowed, current, oldestScore] = result;

  const retryAfterMs =
    allowed === 0 && oldestScore > 0
      ? Math.max(0, oldestScore + windowMs - now)
      : 0;

  return {
    allowed: allowed === 1,
    current,
    limit: max,
    retryAfterMs,
  };
}
