import type { PaymentGateway, PaymentMethod } from "./gateway.interface.js";

/**
 * Central registry for all payment gateway implementations.
 *
 * Usage:
 *   // Resolve by payment method — single gateway (legacy, backward-compatible)
 *   const gateway = GatewayRegistry.forMethod('PIX');
 *
 *   // Resolve all gateways for a method in priority order — used by fallback chain (T-082)
 *   const gateways = GatewayRegistry.listForMethod('PIX');
 *
 *   // Resolve by provider name (webhook routes — T-026)
 *   const gateway = GatewayRegistry.get('asaas');
 */
export class GatewayRegistry {
  /** Keyed by gateway.name (e.g. "asaas"). Insertion order = priority order. */
  private static readonly _byName = new Map<string, PaymentGateway>();

  /**
   * Registers a gateway. Throws if a gateway with the same name is already registered.
   * Call this once at application startup via `registerGateways()`.
   */
  static register(gateway: PaymentGateway): void {
    if (GatewayRegistry._byName.has(gateway.name)) {
      throw new Error(
        `Gateway "${gateway.name}" is already registered. Each gateway name must be unique.`,
      );
    }
    GatewayRegistry._byName.set(gateway.name, gateway);
  }

  /**
   * Resolves a gateway by its canonical name (e.g. "asaas", "pagarme").
   * Used by the webhook route: POST /webhooks/:gateway
   *
   * Throws if the gateway is unknown — the route should translate this to HTTP 404.
   */
  static get(name: string): PaymentGateway {
    const gateway = GatewayRegistry._byName.get(name.toLowerCase());
    if (!gateway) {
      throw new Error(
        `Gateway "${name}" is not registered. ` +
          `Available gateways: [${[...GatewayRegistry._byName.keys()].join(", ")}]`,
      );
    }
    return gateway;
  }

  /**
   * Returns the first registered gateway that supports the given payment method.
   * Throws if no gateway supports the method.
   *
   * Used by ChargeService during charge creation.
   * For multi-gateway setups, extend with priority rules or a config-driven mapping.
   *
   * For the fallback chain (T-082), use `listForMethod()` instead — it returns all
   * matching gateways in priority order so callers can try each in sequence.
   */
  static forMethod(method: PaymentMethod): PaymentGateway {
    for (const gateway of GatewayRegistry._byName.values()) {
      if (
        (gateway.supportedMethods as ReadonlyArray<PaymentMethod>).includes(
          method,
        )
      ) {
        return gateway;
      }
    }
    throw new Error(
      `No gateway registered that supports payment method "${method}". ` +
        `Available gateways: [${[...GatewayRegistry._byName.keys()].join(", ")}]`,
    );
  }

  /**
   * Returns ALL registered gateways that support the given payment method,
   * in registration order (= priority order).
   *
   * Used by the fallback chain (T-082): callers iterate the list and attempt
   * each gateway in sequence, falling back to the next on failure.
   *
   * Returns an empty array when no gateway supports the method — the fallback
   * chain will proceed directly to the static PIX fallback if one is configured.
   *
   * @param method - The payment method to filter by.
   */
  static listForMethod(method: PaymentMethod): PaymentGateway[] {
    const results: PaymentGateway[] = [];
    for (const gateway of GatewayRegistry._byName.values()) {
      if (
        (gateway.supportedMethods as ReadonlyArray<PaymentMethod>).includes(
          method,
        )
      ) {
        results.push(gateway);
      }
    }
    return results;
  }

  /**
   * Returns the names of all registered gateways.
   * Useful for health checks and admin endpoints.
   */
  static list(): string[] {
    return [...GatewayRegistry._byName.keys()];
  }

  /**
   * Removes all registered gateways.
   * ONLY for use in tests — do not call in production code.
   */
  static _reset(): void {
    GatewayRegistry._byName.clear();
  }
}
