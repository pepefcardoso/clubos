import Redis from "ioredis";

let _redis: Redis | null = null;

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
    });

    _redis.on("error", (err) => {
      console.error("[Redis] connection error:", err);
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
