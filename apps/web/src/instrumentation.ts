import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
        beforeSend(event) {
          if (event.request?.data && typeof event.request.data === "object") {
            const body = { ...(event.request.data as Record<string, unknown>) };
            delete body["password"];
            delete body["cpf"];
            event.request = { ...event.request, data: body };
          }
          if (event.request?.cookies) {
            event.request = { ...event.request, cookies: {} };
          }
          return event;
        },
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      });
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
