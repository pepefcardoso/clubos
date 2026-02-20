import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import authPlugin from "./plugins/auth.plugin.js";
import sensiblePlugin from "./plugins/sensible.plugin.js";
import { getPrismaClient } from "./lib/prisma.js";
import { getRedisClient } from "./lib/redis.js";

export async function buildApp() {
  const loggerOptions =
    process.env["NODE_ENV"] === "test"
      ? (false as const)
      : process.env["NODE_ENV"] === "development"
        ? ({
            level: process.env["LOG_LEVEL"] ?? "info",
            transport: { target: "pino-pretty" },
          } as const)
        : ({
            level: process.env["LOG_LEVEL"] ?? "info",
          } as const);

  const fastify = Fastify({ logger: loggerOptions });

  const prisma = getPrismaClient();
  const redis = getRedisClient();

  fastify.decorate("prisma", prisma);
  fastify.decorate("redis", redis);

  await fastify.register(fastifyCors, {
    origin:
      process.env["NODE_ENV"] === "production"
        ? (process.env["ALLOWED_ORIGINS"] ?? "").split(",")
        : true,
    credentials: true,
  });

  await fastify.register(fastifyRateLimit, {
    redis,
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${context.after}.`,
    }),
  });

  await fastify.register(sensiblePlugin);

  await fastify.register(authPlugin);

  fastify.get(
    "/health",
    { config: { rateLimit: false } },
    async (_request, _reply) => ({
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );

  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });

  return fastify;
}
