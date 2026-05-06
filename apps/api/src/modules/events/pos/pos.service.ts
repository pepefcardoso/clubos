import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { assertEventExists } from "../../../lib/assert-tenant-ownership.js";
import { getEnv } from "../../../lib/env.js";
import { GatewayRegistry } from "../../payments/gateway.registry.js";
import { createChargeWithFallback } from "../../payments/gateway-fallback.js";
import type { PosChargeInput, PosChargeResponse } from "./pos.schema.js";

export async function createPosCharge(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
  _actorId: string,
  input: PosChargeInput,
): Promise<PosChargeResponse> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await assertEventExists(tx, eventId);
  });

  const idempotencyKey = `pos-${eventId}-${randomUUID()}`;
  const dueDate = new Date(Date.now() + 15 * 60 * 1_000);

  const posCustomer = {
    name: "PDV",
    cpf: "00000000000",
    phone: "00000000000",
  } as const;

  let resolvedMethod: string = input.method;
  let gatewayMeta: Record<string, unknown> | undefined;
  let usedFallback = false;

  if (input.method === "CARD") {
    const env = getEnv();
    const posProvider = env.POS_PROVIDER;

    if (posProvider) {
      try {
        const mposGateway = GatewayRegistry.get(posProvider);
        const result = await mposGateway.createCharge({
          amountCents: input.amountCents,
          dueDate,
          method: "CREDIT_CARD",
          customer: posCustomer,
          description: input.productName,
          idempotencyKey,
        });
        gatewayMeta = result.meta;
      } catch {
        usedFallback = true;
      }
    } else {
      usedFallback = true;
    }

    if (usedFallback) {
      resolvedMethod = "PIX";
      const pixGateways = GatewayRegistry.listForMethod("PIX");
      const fallbackResult = await createChargeWithFallback(
        pixGateways,
        {
          amountCents: input.amountCents,
          dueDate,
          method: "PIX",
          customer: posCustomer,
          description: input.productName,
          idempotencyKey,
        },
        { pixKeyFallback: null },
      );
      gatewayMeta = fallbackResult.meta;
    }
  } else {
    resolvedMethod = "PIX";
    const pixGateways = GatewayRegistry.listForMethod("PIX");
    const result = await createChargeWithFallback(
      pixGateways,
      {
        amountCents: input.amountCents,
        dueDate,
        method: "PIX",
        customer: posCustomer,
        description: input.productName,
        idempotencyKey,
      },
      { pixKeyFallback: null },
    );
    gatewayMeta = result.meta;
  }

  const sale = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.posSale.create({
      data: {
        id: randomUUID(),
        eventId,
        productName: input.productName,
        amountCents: input.amountCents,
        paymentMethod: resolvedMethod,
        updatedAt: new Date(),
      },
    });
  });

  return {
    saleId: sale.id,
    eventId,
    productName: sale.productName,
    amountCents: sale.amountCents,
    paymentMethod: resolvedMethod,
    ...(gatewayMeta !== undefined ? { gatewayMeta } : {}),
    usedFallback,
  };
}
