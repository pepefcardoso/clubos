import type { PaymentGateway, PaymentMethod } from "./gateway.interface.js";

/**
 * Central registry for all payment gateway implementations.
 *
 * Usage:
 *   // Resolve by payment method (charge creation — T-021)
 *   const gateway = GatewayRegistry.forMethod('PIX');
 *
 *   // Resolve by provider name (webhook routes — T-026)
 *   const gateway = GatewayRegistry.get('asaas');
 */
export class GatewayRegistry {
  /** Keyed by gateway.name (e.g. "asaas") */
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
