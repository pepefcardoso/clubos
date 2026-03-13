import { GatewayRegistry } from "../gateway.registry.js";
import { AsaasGateway } from "./asaas.gateway.js";
import { PagarmeGateway } from "./pagarme.gateway.js";
import { StripeGateway } from "./stripe.gateway.js";

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
 *   Asaas is registered first   → primary gateway for PIX (Brazilian provider).
 *   Pagarme is registered second → secondary fallback gateway.
 *   Stripe is registered third   → tertiary international gateway (opt-in via STRIPE_ENABLED=true).
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

  if (process.env["STRIPE_ENABLED"] === "true") {
    const stripeSecretKey = process.env["STRIPE_SECRET_KEY"];
    const stripeWebhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

    if (!stripeSecretKey || !stripeWebhookSecret) {
      throw new Error(
        "STRIPE_ENABLED=true but missing required env vars: " +
          "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET. Check your .env file.",
      );
    }

    GatewayRegistry.register(
      new StripeGateway({
        secretKey: stripeSecretKey,
        webhookSecret: stripeWebhookSecret,
      }),
    );
  }
}

export { GatewayRegistry } from "../gateway.registry.js";
export type { PaymentGateway, PaymentMethod } from "../gateway.interface.js";
