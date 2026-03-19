import { Redis } from "ioredis";

let _redis: Redis | null = null;

/**
 * Returns true for Redis server errors that indicate a non-recoverable
 * authentication or configuration failure. These require process exit —
 * a server running with a broken Redis connection would silently fail
 * refresh-token rotation, rate limiting, and job enqueueing.
 */
export function _isAuthError(err: Error): boolean {
  const msg = err.message ?? "";
  return (
    msg.includes("WRONGPASS") ||
    msg.includes("NOAUTH") ||
    msg.includes("ERR invalid password") ||
    msg.includes("invalid username-password pair")
  );
}

export function getRedisClient(): Redis {
  if (!_redis) {
    const url = process.env["REDIS_URL"];
    if (!url) {
      throw new Error(
        "Missing required env var: REDIS_URL. Check your .env file.",
      );
    }

    _redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    _redis.on("error", (err: Error) => {
      if (_isAuthError(err)) {
        console.error(
          "[Redis] Authentication failed. Check REDIS_URL password. " +
            "Process will exit. Error:",
          err.message,
        );
        process.exit(1);
      }
      console.error("[Redis] connection error:", err);
    });

    _redis.connect().catch((err: Error) => {
      if (_isAuthError(err)) {
        console.error(
          "[Redis] Startup authentication failed. Check REDIS_URL. " +
            "Process will exit. Error:",
          err.message,
        );
        process.exit(1);
      }
      console.error("[Redis] Initial connection error (will retry):", err);
    });
  }

  return _redis;
}

const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function storeRefreshToken(
  redis: Redis,
  jti: string,
  userId: string,
): Promise<void> {
  await redis.set(
    `refresh_token:${jti}`,
    userId,
    "EX",
    REFRESH_TOKEN_TTL_SECONDS,
  );
}

export async function consumeRefreshToken(
  redis: Redis,
  jti: string,
): Promise<string | null> {
  const pipeline = redis.pipeline();
  pipeline.get(`refresh_token:${jti}`);
  pipeline.del(`refresh_token:${jti}`);
  const results = await pipeline.exec();

  if (!results) return null;

  const [getResult] = results;
  if (!getResult) return null;

  const [err, userId] = getResult;
  if (err || typeof userId !== "string") return null;

  return userId;
}

export async function revokeRefreshToken(
  redis: Redis,
  jti: string,
): Promise<void> {
  await redis.del(`refresh_token:${jti}`);
}
