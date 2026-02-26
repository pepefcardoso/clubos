import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import authPlugin from "./plugins/auth.plugin.js";
import sensiblePlugin from "./plugins/sensible.plugin.js";
import securityHeadersPlugin from "./plugins/security-headers.plugin.js";
import { getPrismaClient } from "./lib/prisma.js";
import { getRedisClient } from "./lib/redis.js";
import { getUploadDir } from "./lib/storage.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { clubRoutes } from "./modules/clubs/clubs.routes.js";
import { protectedRoutes } from "./modules/protected.routes.js";
import { registerGateways } from "./modules/payments/gateways/index.js";
import fastifyMultipart from "@fastify/multipart";

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

  registerGateways();

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

  await fastify.register(securityHeadersPlugin);

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  await fastify.register(fastifyStatic, {
    root: getUploadDir(),
    prefix: "/uploads/",
    decorateReply: false,
  });

  await fastify.register(authPlugin);

  await fastify.register(authRoutes, { prefix: "/api/auth" });

  await fastify.register(clubRoutes, { prefix: "/api/clubs" });

  fastify.get(
    "/api/members/import/template",
    { config: { rateLimit: false } },
    async (_request, reply) => {
      const currentDir = fileURLToPath(new URL(".", import.meta.url));
      const filePath = join(currentDir, "..", "assets", "template-socios.csv");
      const content = await readFile(filePath);

      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          'attachment; filename="template-socios.csv"',
        )
        .send(content);
    },
  );

  await fastify.register(protectedRoutes, { prefix: "/api" });

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