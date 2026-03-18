import fp from "fastify-plugin";
import * as Sentry from "@sentry/node";
import type { ErrorEvent, EventHint as SentryEventHint } from "@sentry/node";
import type {
  FastifyInstance,
  FastifyError,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { REFRESH_TOKEN_COOKIE } from "../lib/tokens.js";
import { AppError } from "../lib/errors.js";

/**
 * Builds the `beforeSend` callback used by Sentry.init().
 *
 * Extracted as a named export so it can be unit-tested without
 * initialising Sentry or spinning up a Fastify instance.
 *
 * Behaviour:
 *  - Returns `null` (suppresses event) for operational AppErrors —
 *    these are valid business outcomes (auth failures, not found, etc.)
 *    and would create noise that obscures real infrastructure issues.
 *  - Strips the refresh token cookie so it never leaves the server.
 *  - Strips `password` and `cpf` from the request body as a belt-and-
 *    suspenders measure over Zod validation (raw body may still carry them).
 *  - Preserves all other event data unchanged.
 */
export function buildBeforeSend(
  refreshTokenCookieName: string,
): (event: ErrorEvent, hint: SentryEventHint) => ErrorEvent | null {
  return (event: ErrorEvent, hint: SentryEventHint): ErrorEvent | null => {
    const err = hint.originalException;

    if (err instanceof AppError && err.isOperational) {
      return null;
    }

    if (event.request?.cookies) {
      const sanitisedCookies = {
        ...(event.request.cookies as Record<string, string>),
      };
      delete sanitisedCookies[refreshTokenCookieName];
      event.request = { ...event.request, cookies: sanitisedCookies };
    }

    if (event.request?.data && typeof event.request.data === "object") {
      const body = { ...(event.request.data as Record<string, unknown>) };
      delete body["password"];
      delete body["cpf"];
      event.request = { ...event.request, data: body };
    }

    return event;
  };
}

/**
 * Initialises Sentry and registers a Fastify `onError` hook that captures
 * unexpected errors with full request context.
 *
 * Must be registered BEFORE all other plugins in buildApp() so that
 * Sentry.init() is called prior to any async work.
 *
 * No-ops gracefully when SENTRY_DSN is absent (development / test).
 */
async function sentryPlugin(fastify: FastifyInstance): Promise<void> {
  const dsn = process.env["SENTRY_DSN"];
  const isProduction = process.env["NODE_ENV"] === "production";

  if (!dsn) {
    fastify.log.info("[sentry] SENTRY_DSN not set — Sentry disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    beforeSend: buildBeforeSend(REFRESH_TOKEN_COOKIE),
  });

  fastify.log.info(
    "[sentry] Initialised (environment: %s)",
    process.env["NODE_ENV"],
  );

  fastify.addHook(
    "onError",
    async (
      _request: FastifyRequest,
      _reply: FastifyReply,
      error: FastifyError,
    ) => {
      if (error instanceof AppError && error.isOperational) return;
      Sentry.captureException(error);
    },
  );
}

export default fp(sentryPlugin, {
  name: "sentry",
  fastify: "5.x",
});
