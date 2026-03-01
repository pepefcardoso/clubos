import type { WhatsAppProvider } from "./whatsapp.interface.js";

/**
 * Central registry for the active WhatsApp provider.
 *
 * Unlike the payment GatewayRegistry (which supports multiple providers
 * simultaneously), a club uses exactly one WhatsApp provider at a time,
 * selected via the WHATSAPP_PROVIDER env var. The registry holds a single
 * instance registered at application bootstrap.
 *
 * Usage:
 *   // Bootstrap (providers/index.ts)
 *   WhatsAppRegistry.register(new ZApiProvider());
 *
 *   // Runtime (whatsapp.service.ts)
 *   const provider = WhatsAppRegistry.get();
 *   await provider.sendMessage(input);
 */
export class WhatsAppRegistry {
  private static _provider: WhatsAppProvider | null = null;

  /**
   * Registers the active provider. Replaces any previously registered
   * provider (allows re-registration in tests via _reset + register).
   */
  static register(provider: WhatsAppProvider): void {
    WhatsAppRegistry._provider = provider;
  }

  /**
   * Returns the registered provider.
   *
   * @throws {Error} if no provider has been registered yet — surfaces
   *   misconfigured deployments at runtime rather than silently failing.
   */
  static get(): WhatsAppProvider {
    if (!WhatsAppRegistry._provider) {
      throw new Error(
        "No WhatsApp provider registered. " +
          "Call registerWhatsAppProvider() during app bootstrap.",
      );
    }
    return WhatsAppRegistry._provider;
  }

  /**
   * Removes the registered provider.
   * ONLY for use in tests — do not call in production code.
   */
  static _reset(): void {
    WhatsAppRegistry._provider = null;
  }
}
