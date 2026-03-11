import { GatewayRegistry } from "../gateway.registry.js";
import { AsaasGateway } from "./asaas.gateway.js";
import { PagarmeGateway } from "./pagarme.gateway.js";

/**
 * GATEWAY BOOTSTRAP
 *
 * To add a new gateway:
 *   1. Create `<provider>.gateway.ts` implementing PaymentGateway
 *   2. Import it here and call GatewayRegistry.register(new ProviderGateway(...))
 *   3. Add the required env vars to .env.example
 *   4. No other file needs to change.
 *
 * INSERTION ORDER = PRIORITY
 *   GatewayRegistry.forMethod() returns the first matching gateway.
 *   Asaas is registered first → primary gateway for PIX.
 *   Pagarme is registered second → fallback gateway (T-082 will add explicit
 *   fallback logic, but insertion order already achieves this for the basic case).
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

  const pagarmeApiKey = process.env["PAGARME_API_KEY"];
  const pagarmeWebhookSecret = process.env["PAGARME_WEBHOOK_SECRET"];

  if (pagarmeApiKey && pagarmeWebhookSecret) {
    GatewayRegistry.register(
      new PagarmeGateway({
        apiKey: pagarmeApiKey,
        webhookSecret: pagarmeWebhookSecret,
        sandbox: process.env["NODE_ENV"] !== "production",
      }),
    );
  }
}

export { GatewayRegistry } from "../gateway.registry.js";
export type { PaymentGateway, PaymentMethod } from "../gateway.interface.js";
