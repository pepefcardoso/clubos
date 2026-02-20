import type { PaymentGateway, PaymentMethod } from "./gateway.interface.ts";

/**
 * Usage:
 *   // resolve by provider name (webhook routes)
 *   const gateway = GatewayRegistry.get('asaas');
 *
 *   // resolve by payment method (charge creation)
 *   const gateway = GatewayRegistry.forMethod('PIX');
 */
export class GatewayRegistry {
  private static readonly store = new Map<string, PaymentGateway>();

  /**
   * Registers a gateway. Throws if a gateway with the same name is already registered.
   * Call this once at application startup.
   */
  static register(gateway: PaymentGateway): void {
    if (GatewayRegistry.store.has(gateway.name)) {
      throw new Error(
        `Gateway "${gateway.name}" is already registered. ` +
          `Each gateway name must be unique.`,
      );
    }
    GatewayRegistry.store.set(gateway.name, gateway);
  }

  /**
   * Resolves a gateway by its name (e.g. "asaas", "pagarme").
   * Throws if the gateway is not registered.
   */
  static get(name: string): PaymentGateway {
    const gateway = GatewayRegistry.store.get(name);
    if (!gateway) {
      throw new Error(
        `Gateway "${name}" is not registered. ` +
          `Available gateways: [${[...GatewayRegistry.store.keys()].join(", ")}]`,
      );
    }
    return gateway;
  }

  /**
   * Returns the first registered gateway that supports the given payment method.
   * Throws if no gateway supports the method.
   *
   * For multi-gateway setups, consider extending this with priority rules
   * or a configuration-driven method→gateway mapping.
   */
  static forMethod(method: PaymentMethod): PaymentGateway {
    for (const gateway of GatewayRegistry.store.values()) {
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
        `Available gateways: [${[...GatewayRegistry.store.keys()].join(", ")}]`,
    );
  }

  /**
   * Returns the names of all registered gateways.
   * Useful for health checks and admin endpoints.
   */
  static list(): string[] {
    return [...GatewayRegistry.store.keys()];
  }

  /**
   * Removes all registered gateways.
   * Only used in tests — do not call in production code.
   */
  static _reset(): void {
    GatewayRegistry.store.clear();
  }
}
