import { WhatsAppRegistry } from "../whatsapp.registry.js";
import { ZApiProvider } from "./zapi.provider.js";
import { EvolutionProvider } from "./evolution.provider.js";

/**
 * WHATSAPP PROVIDER BOOTSTRAP
 *
 * Reads WHATSAPP_PROVIDER from the environment and registers the matching
 * concrete implementation in WhatsAppRegistry.
 *
 * To add a new provider:
 *   1. Create `<provider>.provider.ts` implementing WhatsAppProvider
 *   2. Import it here and add a case in the switch
 *   3. Add the required env vars to .env.example
 *   4. No other file needs to change.
 *
 * Called once during app bootstrap in server.ts, alongside registerGateways().
 */
export function registerWhatsAppProvider(): void {
  const providerName = process.env["WHATSAPP_PROVIDER"] ?? "zapi";

  switch (providerName) {
    case "zapi":
      WhatsAppRegistry.register(new ZApiProvider());
      break;
    case "evolution":
      WhatsAppRegistry.register(new EvolutionProvider());
      break;
    default:
      throw new Error(
        `Unknown WHATSAPP_PROVIDER: "${providerName}". ` +
          'Supported values: "zapi", "evolution"',
      );
  }
}

export { WhatsAppRegistry } from "../whatsapp.registry.js";
export type {
  WhatsAppProvider,
  SendMessageInput,
  SendMessageResult,
} from "../whatsapp.interface.js";
