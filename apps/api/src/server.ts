import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { Queue } from "bullmq";
import { validateEnv, getEnv } from "./lib/env.js";
import sentryPlugin from "./plugins/sentry.plugin.js";
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
import { webhookRoutes } from "./modules/webhooks/webhooks.routes.js";
import { eventsRoutes } from "./modules/events/events.routes.js";
import type { WebhookJobData } from "./modules/webhooks/webhooks.service.js";
import fastifyMultipart from "@fastify/multipart";
import { registerJobs, closeJobs } from "./jobs/index.js";
import { registerWhatsAppProvider } from "./modules/whatsapp/providers/index.js";
import { memberVerifyRoutes } from "./modules/members/members.verify.routes.js";
import { balanceSheetPublicRoutes } from "./modules/balance-sheets/balance-sheets.public.routes.js";
import { integrationIngestRoutes } from "./modules/integrations/integrations.ingest.routes.js";
import { clubPublicRoutes } from "./modules/clubs/clubs.public.routes.js";
import { tryoutConsentRoutes } from "./modules/tryout/tryout-consent.routes.js";

export async function buildApp() {
  validateEnv();

  const env = getEnv();

  const loggerOptions =
    env.NODE_ENV === "test"
      ? (false as const)
      : env.NODE_ENV === "development"
        ? ({
            level: env.LOG_LEVEL,
            transport: { target: "pino-pretty" },
          } as const)
        : {
            level: env.LOG_LEVEL,
            redact: [
              "req.query.token",
              "req.headers.authorization",
            ] as string[],
          };

  const fastify = Fastify({ logger: loggerOptions });

  const prisma = getPrismaClient();
  const redis = getRedisClient();

  fastify.decorate("prisma", prisma);
  fastify.decorate("redis", redis);

  registerGateways();
  registerWhatsAppProvider();

  const webhookQueue = new Queue<WebhookJobData>("webhook-events", {
    connection: redis,
  });
  fastify.decorate("webhookQueue", webhookQueue);

  await registerJobs();

  await fastify.register(sentryPlugin);

  const allowedOrigins: string[] =
    env.NODE_ENV === "production"
      ? (env.ALLOWED_ORIGINS ?? "")
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];

  await fastify.register(fastifyCors, {
    /**
     * Function-based origin instead of a static string or array gives us:
     *
     *   1. Per-request warn log for every rejected origin — essential for
     *      detecting misconfigured clients or active probing in production.
     *   2. Transparent  with no Origin header
     *      (same-origin browser requests, curl, server-to-server calls).
     *      CORS policy only restricts cross-origin browser requests.
     *   3. Full allow-all for development without using `origin: true` or
     *      `origin: '*'` — both of which @fastify/cors would pair with
     *      credentials=true, causing browsers to reject the response.
     *
     * Security rule:
     *   - NEVER set `origin: '*'` — browsers block it when credentials=true.
     *   - NEVER set `origin: true` in production — it reflects every Origin.
     *   - Any rejection MUST be logged with the offending origin so security
     *     teams can investigate unexpected CORS probing.
     */
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (env.NODE_ENV !== "production") return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);

      fastify.log.warn(
        { origin, allowedOrigins },
        "[cors] Cross-origin request rejected — origin not in ALLOWED_ORIGINS",
      );

      return cb(
        new Error(`Origin "${origin}" is not permitted by CORS policy.`),
        false,
      );
    },
  });

  await fastify.register(fastifyRateLimit, {
    redis,
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request: unknown, context: { after: string }) => ({
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

  await fastify.register(webhookRoutes, { prefix: "/webhooks" });

  await fastify.register(memberVerifyRoutes, { prefix: "/api/public" });

  await fastify.register(balanceSheetPublicRoutes, { prefix: "/api/public" });

  await fastify.register(clubPublicRoutes, { prefix: "/api/public" });

  await fastify.register(tryoutConsentRoutes, { prefix: "/api/public" });

  await fastify.register(eventsRoutes, { prefix: "/api/events" });

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

  await fastify.register(integrationIngestRoutes, { prefix: "/api/public" });

  await fastify.register(protectedRoutes, { prefix: "/api" });

  fastify.get("/health", { config: { rateLimit: false } }, async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
    redis.disconnect();
    await webhookQueue.close();
    await closeJobs();
  });

  return fastify;
}
