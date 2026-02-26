import { GatewayRegistry } from "../gateway.registry.js";
import { AsaasGateway } from "./asaas.gateway.js";

/**
 * GATEWAY BOOTSTRAP
 *
 * To add a new gateway:
 *   1. Create `<provider>.gateway.ts` implementing PaymentGateway
 *   2. Import it here and call GatewayRegistry.register(new ProviderGateway(...))
 *   3. Add the required env vars to .env.example
 *   4. No other file needs to change.
 */
export function registerGateways(): void {
  const asaasApiKey = process.env["ASAAS_API_KEY"];
  const asaasWebhookSecret = process.env["ASAAS_WEBHOOK_SECRET"];

  if (!asaasApiKey || !asaasWebhookSecret) {
    throw new Error(
      "Missing required env vars: ASAAS_API_KEY, ASAAS_WEBHOOK_SECRET. " +
        "Check your .env file.",
    );
  }

  GatewayRegistry.register(
    new AsaasGateway({
      apiKey: asaasApiKey,
      webhookSecret: asaasWebhookSecret,
      sandbox: process.env["NODE_ENV"] !== "production",
    }),
  );
}

export { GatewayRegistry } from "../gateway.registry.js";
export type { PaymentGateway, PaymentMethod } from "../gateway.interface.js";
