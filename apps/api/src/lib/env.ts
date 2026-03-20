import { z } from "zod";

/**
 * Validates all required environment variables at process startup.
 *
 * Called as the FIRST statement in buildApp() so misconfiguration
 * surfaces immediately — before any DB connection, Redis connection,
 * or plugin registration is attempted.
 *
 * SSL enforcement:
 *   In production, DATABASE_URL must include ?sslmode=verify-full plus
 *   sslrootcert (recommended for managed DBs such as RDS, Supabase, Neon)
 *   or ?sslmode=verify-ca at minimum. Bare sslmode=require no longer
 *   satisfies the production gate — it encrypts the channel but does not
 *   authenticate the server certificate, leaving the connection vulnerable
 *   to man-in-the-middle attacks.
 *   Local development with Docker (sslmode=disable or no sslmode) remains
 *   valid when NODE_ENV !== "production".
 *
 * Redis TLS enforcement:
 *   In production, REDIS_URL must use the rediss:// scheme (TLS) and include
 *   a password. The plain redis:// scheme transmits data in cleartext and
 *   allows unauthenticated access to refresh tokens and BullMQ job data.
 *   Development and test environments accept redis:// for Docker compatibility.
 *
 * CORS origins enforcement:
 *   In production, ALLOWED_ORIGINS must be set to a non-empty comma-separated
 *   list of https:// origins. http:// origins are forbidden — the application
 *   relies on httpOnly cookies that browsers only transmit over secure
 *   connections. Missing or http:// origins crash the process at startup.
 *   Development and test environments accept any value (or none) for
 *   compatibility with local Next.js dev servers and API clients.
 */

const DatabaseUrlSchema = z.string().superRefine((url, ctx) => {
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    ctx.addIssue({
      code: "custom",
      message: "DATABASE_URL must start with postgresql:// or postgres://",
    });
    return;
  }

  if (process.env["NODE_ENV"] === "production") {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "DATABASE_URL is not a valid URL.",
      });
      return;
    }

    const sslMode = parsed.searchParams.get("sslmode");

    const acceptedSslModes = ["verify-ca", "verify-full"];

    if (!sslMode || !acceptedSslModes.includes(sslMode)) {
      ctx.addIssue({
        code: "custom",
        message:
          `DATABASE_URL must include ?sslmode=verify-full&sslrootcert=<path> ` +
          `(or sslmode=verify-ca) in production. ` +
          `Current sslmode: "${sslMode ?? "not set"}". ` +
          `Bare sslmode=require is no longer accepted — it does not authenticate ` +
          `the server certificate. `
      });
      return;
    }

    if (sslMode === "verify-full" && !parsed.searchParams.get("sslrootcert")) {
      ctx.addIssue({
        code: "custom",
        message:
          `DATABASE_URL with sslmode=verify-full must also include ` +
          `sslrootcert=<path-to-ca-bundle> so the server certificate can be ` +
          `fully validated. Download the CA bundle from your managed DB provider ` +
          `(RDS, Supabase, Neon, Cloud SQL) and set the path here. `
      });
    }
  }
});

const RedisUrlSchema = z.string().superRefine((url, ctx) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "REDIS_URL is not a valid URL.",
    });
    return;
  }

  const validSchemes = ["redis:", "rediss:"];
  if (!validSchemes.includes(parsed.protocol)) {
    ctx.addIssue({
      code: "custom",
      message:
        `REDIS_URL must start with redis:// or rediss://. ` +
        `Got: "${parsed.protocol.replace(":", "")}"`,
    });
    return;
  }

  if (process.env["NODE_ENV"] === "production") {
    if (parsed.protocol !== "rediss:") {
      ctx.addIssue({
        code: "custom",
        message:
          `REDIS_URL must use the rediss:// scheme in production to enforce TLS. ` +
          `Current scheme: "${parsed.protocol.replace(":", "")}". ` +
          `Plain redis:// transmits refresh tokens and BullMQ job data in cleartext. ` +
          `Example: rediss://:STRONG_PASSWORD@host:6380 `,
      });
      return;
    }

    if (!parsed.password) {
      ctx.addIssue({
        code: "custom",
        message:
          `REDIS_URL must include a password in production: rediss://:PASSWORD@host:port. ` +
          `A password-less Redis instance is not acceptable for production workloads — ` +
          `it allows unauthenticated access to refresh tokens and rate-limit buckets. `,
      });
    }
  }
});

/**
 * Validates ALLOWED_ORIGINS for CORS enforcement.
 *
 * Production rules:
 *   - Must be set and non-empty.
 *   - Every entry in the comma-separated list must use https://.
 *   - http:// origins are rejected — the application uses httpOnly cookies
 *     which browsers only send over secure connections.
 *
 * Development / test:
 *   - Optional. Any value (including http://localhost:*) is accepted so local
 *     Next.js dev servers and API clients (Insomnia, Postman) work without
 *     additional configuration.
 */
const AllowedOriginsSchema = z
  .string()
  .optional()
  .superRefine((val, ctx) => {
    if (process.env["NODE_ENV"] !== "production") return;

    if (!val || val.trim() === "") {
      ctx.addIssue({
        code: "custom",
        message:
          "ALLOWED_ORIGINS must be set in production with at least one " +
          "https:// origin (comma-separated). " +
          "Example: ALLOWED_ORIGINS=https://app.clubos.com.br,https://clubos.com.br ",
      });
      return;
    }

    const origins = val
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    if (origins.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "ALLOWED_ORIGINS must contain at least one non-empty origin in production. ",
      });
      return;
    }

    for (const origin of origins) {
      if (!origin.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          message:
            `ALLOWED_ORIGINS: "${origin}" must use the https:// scheme in production. ` +
            `Plain http:// origins are forbidden — the application uses httpOnly cookies ` +
            `which are only transmitted over secure connections. `,
        });
      }
    }
  });

export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: DatabaseUrlSchema,

  REDIS_URL: RedisUrlSchema,

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  MEMBER_ENCRYPTION_KEY: z
    .string()
    .min(32, "MEMBER_ENCRYPTION_KEY must be at least 32 characters"),

  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  ASAAS_API_KEY: z.string().optional(),
  ASAAS_WEBHOOK_SECRET: z.string().optional(),
  SENTRY_DSN: z.url().optional().or(z.literal("")),
  ALLOWED_ORIGINS: AllowedOriginsSchema,
});

export type Env = z.infer<typeof EnvSchema>;

let _validated: Env | null = null;

/**
 * Validates all environment variables against EnvSchema.
 *
 * Throws a descriptive error on the first failure, which will crash the
 * process — intentional fail-fast behaviour before any I/O is attempted.
 *
 * After the first successful call the result is cached so subsequent
 * calls (e.g. from getPrismaClient) are free.
 */
export function validateEnv(): Env {
  if (_validated) return _validated;

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `  • [${i.path.join(".")}] ${i.message}`)
      .join("\n");

    throw new Error(
      `\n[env] Environment validation failed. Fix the following before starting:\n${messages}\n`,
    );
  }

  _validated = result.data;
  return _validated;
}

/**
 * Returns the cached validated env. Must call validateEnv() first.
 *
 * Throws if validateEnv() has not been called — prevents modules from
 * bypassing the startup validation gate.
 */
export function getEnv(): Env {
  if (!_validated) {
    throw new Error(
      "getEnv() called before validateEnv(). " +
        "Ensure validateEnv() is the first statement in buildApp().",
    );
  }
  return _validated;
}

/**
 * Resets the singleton cache.
 *
 * FOR TEST USE ONLY — allows each test to re-run validation against
 * a freshly composed process.env without module-level state leaking
 * between test cases.
 */
export function _resetEnvCache(): void {
  _validated = null;
}
