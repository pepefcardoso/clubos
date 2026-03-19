import { z } from "zod";

/**
 * Validates all required environment variables at process startup.
 *
 * Called as the FIRST statement in buildApp() so misconfiguration
 * surfaces immediately — before any DB connection, Redis connection,
 * or plugin registration is attempted.
 *
 * SSL enforcement (L-14):
 *   In production, DATABASE_URL must include ?sslmode=require (or
 *   sslmode=verify-full for stricter certificate validation).
 *   Local development with Docker (sslmode=disable) remains valid
 *   when NODE_ENV !== "production".
 *
 * See docs/security-guidelines.md §3 (L-14).
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
    const acceptedSslModes = ["require", "verify-ca", "verify-full"];

    if (!sslMode || !acceptedSslModes.includes(sslMode)) {
      ctx.addIssue({
        code: "custom",
        message:
          `DATABASE_URL must include ?sslmode=require (or verify-ca / verify-full) ` +
          `in production. Current sslmode: "${sslMode ?? "not set"}". ` +
          `See docs/security-guidelines.md §3 (L-14).`,
      });
    }
  }
});

export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: DatabaseUrlSchema,

  REDIS_URL: z.url({ message: "REDIS_URL must be a valid URL" }),

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
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
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
