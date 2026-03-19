import type { Redis } from "ioredis";
import { TooManyRequestsError } from "../../lib/errors.js";

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_SECONDS = 900;

/**
 * Builds the Redis key for the login attempt counter.
 * Lowercased to prevent case-sensitivity bypass (e.g. Admin@Club.com vs admin@club.com).
 */
function attemptKey(email: string): string {
  return `login_attempts:${email.toLowerCase()}`;
}

/**
 * Throws TooManyRequestsError if the email is currently locked out.
 *
 * Must be called BEFORE password validation so that locked accounts are
 * rejected before any DB or bcrypt work is performed.
 *
 * The error message is intentionally identical to a bad-password response
 * ("Credenciais inválidas.") — this prevents user enumeration through
 * different error wording or response timing.
 */
export async function checkLoginAttempts(
  redis: Redis,
  email: string,
): Promise<void> {
  const raw = await redis.get(attemptKey(email));
  if (raw !== null && parseInt(raw, 10) >= MAX_ATTEMPTS) {
    throw new TooManyRequestsError("Credenciais inválidas.");
  }
}

/**
 * Increments the failed-attempt counter for the given email.
 *
 * The TTL is set only on the first increment so the lockout window is
 * fixed — it does NOT reset with every subsequent failed attempt.
 * (Fixed-window strategy: acceptable for v1 club sizes.)
 *
 * Returns the current attempt count after this increment so the caller
 * can decide which AuditAction to log (LOGIN_FAILED vs LOGIN_LOCKED).
 */
export async function recordFailedAttempt(
  redis: Redis,
  email: string,
): Promise<number> {
  const key = attemptKey(email);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOCKOUT_WINDOW_SECONDS);
  }
  return count;
}

/**
 * Clears the failed-attempt counter after a successful login.
 *
 * Prevents legitimate users from being locked out after eventually
 * authenticating successfully within the lockout window.
 */
export async function clearLoginAttempts(
  redis: Redis,
  email: string,
): Promise<void> {
  await redis.del(attemptKey(email));
}

/**
 * Returns true when the given attempt count exactly crosses the lockout
 * threshold on this attempt.
 *
 * Used by the login handler to distinguish LOGIN_FAILED (below threshold)
 * from LOGIN_LOCKED (threshold reached on this attempt) for audit logging.
 * Subsequent attempts beyond MAX_ATTEMPTS return false — the account is
 * already locked; the crossing event was already recorded.
 */
export function isLockoutThreshold(count: number): boolean {
  return count === MAX_ATTEMPTS;
}
