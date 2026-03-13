import type {
  PaymentGateway,
  CreateChargeInput,
  ChargeResult,
  ChargeExternalStatus,
} from "./gateway.interface.js";

/**
 * Per-attempt error recorded when a gateway fails during the fallback chain.
 */
export interface GatewayAttemptError {
  gatewayName: string;
  error: string;
}

/**
 * Extended result returned by createChargeWithFallback().
 * Includes which gateway ultimately handled the charge (null = static PIX fallback).
 */
export interface ChargeWithFallbackResult extends ChargeResult {
  /** Name of the gateway that succeeded, or null for static PIX fallback. */
  resolvedGatewayName: string | null;
  /**
   * True when all registered gateways failed and the club's static PIX key
   * was used as a last resort. The charge has no externalId in this case.
   * ChargeService must persist gatewayName=null and externalId=null.
   */
  isStaticFallback: boolean;
  /** Per-gateway errors collected before falling through to the next provider. */
  attemptErrors: GatewayAttemptError[];
}

/**
 * Options for createChargeWithFallback().
 */
export interface FallbackOptions {
  /**
   * The club's own Pix key (CPF, CNPJ, phone, e-mail or random UUID key).
   * Used as a last-resort when all registered gateways fail.
   *
   * When absent or null, the function throws the last gateway error instead
   * of producing a static PIX charge, allowing BullMQ to retry normally.
   */
  pixKeyFallback?: string | null | undefined;
}

/**
 * Attempts to create a charge using each gateway in `gateways` in order.
 * Falls back silently to the next provider on failure.
 *
 * Fallback priority:
 *   1. First gateway in list (e.g. Asaas) — primary
 *   2. Second gateway in list (e.g. Pagarme) — secondary
 *   3. Static PIX using club's own pixKeyFallback — last resort
 *   4. Re-throw last error if no pixKeyFallback is configured
 *
 * If ALL gateways fail AND `options.pixKeyFallback` is provided, returns a
 * static PIX charge (no external gateway, no QR code) so the treasurer can
 * share their own Pix key manually with the member.
 *
 * If ALL gateways fail AND no `pixKeyFallback` is set, re-throws the **last**
 * gateway error, allowing the BullMQ job to retry normally.
 *
 * Design contract:
 *  - Pure function: no I/O, no Prisma, no Redis side effects.
 *  - Idempotent: safe to call multiple times with the same `idempotencyKey`
 *    because gateway idempotency is delegated to each provider's `createCharge`.
 *  - The `isStaticFallback` flag must be propagated to the ChargeService so it
 *    can set `gatewayName = null` and `externalId = null` on the DB row.
 *  - Does NOT notify the club when falling back.
 *
 * @param gateways - Ordered list from GatewayRegistry.listForMethod(). May be empty.
 * @param input    - Standard CreateChargeInput (method, amount, customer, etc.).
 * @param options  - Optional fallback overrides (pixKeyFallback).
 */
export async function createChargeWithFallback(
  gateways: PaymentGateway[],
  input: CreateChargeInput,
  options: FallbackOptions = {},
): Promise<ChargeWithFallbackResult> {
  const attemptErrors: GatewayAttemptError[] = [];

  for (const gateway of gateways) {
    try {
      const result = await gateway.createCharge(input);
      return {
        ...result,
        resolvedGatewayName: gateway.name,
        isStaticFallback: false,
        attemptErrors,
      };
    } catch (err) {
      attemptErrors.push({
        gatewayName: gateway.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (options.pixKeyFallback) {
    return buildStaticPixResult(options.pixKeyFallback, attemptErrors);
  }

  const lastError = attemptErrors.at(-1);
  throw new Error(
    lastError
      ? `All payment gateways failed. Last error (${lastError.gatewayName}): ${lastError.error}`
      : "No payment gateway available for the requested method.",
  );
}

/**
 * Builds the static PIX charge result used when all gateways have failed
 * and the club has a configured pixKeyFallback.
 *
 * The `meta.pixKey` field stores the club's Pix key so the frontend
 * can display it to the treasurer for manual collection.
 *
 * - `externalId` is an empty string (ChargeService maps this to null in DB).
 * - `status` is always PENDING — the treasurer must confirm receipt manually
 *   via the standard offline payment flow.
 * - `gatewayName` (via resolvedGatewayName) is null — same path as CASH/BANK_TRANSFER.
 *
 * Static PIX gatewayMeta shape:
 *   { type: "static_pix", pixKey: "<clube's pix key>" }
 */
function buildStaticPixResult(
  pixKey: string,
  attemptErrors: GatewayAttemptError[],
): ChargeWithFallbackResult {
  return {
    externalId: "",
    status: "PENDING" as ChargeExternalStatus,
    meta: {
      type: "static_pix",
      pixKey,
    },
    resolvedGatewayName: null,
    isStaticFallback: true,
    attemptErrors,
  };
}
