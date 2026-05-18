import { addDays, subDays } from "date-fns";
import { createId } from "@paralleldrive/cuid2";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { GatewayRegistry } from "../../payments/gateway.registry.js";
import { ConflictError, NotFoundError } from "../../../lib/errors.js";
import type { HandleScoutBillingPaymentInput } from "./scout-billing.schema.js";
import { scoutSubscriptionRenewalQueue } from "../../../jobs/queues.js";
import { SCOUT_SUBSCRIPTION_RENEWAL_JOB_NAMES } from "./../../../jobs/scout-subscription-renewal/scout-subscription-renewal.types.js";
import type { ScoutSubscriptionRenewalJobData } from "./../../../jobs/scout-subscription-renewal/scout-subscription-renewal.types.js";

export const SCOUT_SUBSCRIPTION_PRICE_CENTS = 29900;
export const SCOUT_SUBSCRIPTION_DAYS = 30;
const RENEWAL_LEAD_DAYS = 3;
const ACTIVE_RENEWAL_BUFFER_DAYS = 7;

/** Returns current billing cycle as YYYY-MM (UTC). */
export function currentBillingCycle(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Formats a Date as YYYY-MM (UTC). */
export function formatBillingCycle(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Builds the externalReference string used as the idempotency key passed to
 * the gateway and later parsed by the webhook worker to route back here.
 * Format: `scout-billing:{scoutId}:{billingCycle}`
 */
export function buildBillingRef(scoutId: string, billingCycle: string): string {
  return `scout-billing:${scoutId}:${billingCycle}`;
}

/**
 * Initiates a scout subscription PIX charge via GatewayRegistry.
 *
 * No DB write happens here — the `scout_billing_payments` row is created
 * by `handleScoutBillingPaymentConfirmed` when the gateway webhook fires.
 *
 * Guards:
 *   1. Scout must exist.
 *   2. Already ACTIVE with > 7 days remaining → 409 "Assinatura já ativa."
 *   3. billingCycle already confirmed paid → 409 "Ciclo já pago."
 */
export async function subscribe(
  prisma: PrismaClient,
  scoutId: string,
): Promise<{
  billingCycle: string;
  amountCents: number;
  pixCopyPaste: string | null;
  qrCodeBase64: string | null;
  externalId: string;
}> {
  const scout = await prisma.scoutProfile.findUnique({
    where: { id: scoutId },
    select: {
      id: true,
      name: true,
      email: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
    },
  });
  if (!scout) throw new NotFoundError("Scout não encontrado.");

  const now = new Date();
  if (
    scout.subscriptionStatus === "ACTIVE" &&
    scout.subscriptionExpiresAt !== null &&
    scout.subscriptionExpiresAt > addDays(now, ACTIVE_RENEWAL_BUFFER_DAYS)
  ) {
    throw new ConflictError("Assinatura já ativa.");
  }

  const billingCycle = currentBillingCycle();

  const existing = await prisma.scoutBillingPayment.findUnique({
    where: { scoutId_billingCycle: { scoutId, billingCycle } },
    select: { id: true },
  });
  if (existing) throw new ConflictError("Ciclo já pago.");

  const gateway = GatewayRegistry.forMethod("PIX");

  const idempotencyKey = buildBillingRef(scoutId, billingCycle);
  const dueDate = addDays(now, 3);

  const charge = await gateway.createCharge({
    amountCents: SCOUT_SUBSCRIPTION_PRICE_CENTS,
    dueDate,
    method: "PIX",
    customer: {
      name: scout.name,
      email: scout.email,
      cpf: "",
      phone: "",
    },
    description: `ClubOS ScoutLink — assinatura ${billingCycle}`,
    idempotencyKey,
    externalReference: idempotencyKey,
  });

  return {
    billingCycle,
    amountCents: SCOUT_SUBSCRIPTION_PRICE_CENTS,
    pixCopyPaste:
      ((charge.meta as Record<string, unknown>)?.pixCopyPaste as
        | string
        | null) ?? null,
    qrCodeBase64:
      ((charge.meta as Record<string, unknown>)?.qrCodeBase64 as
        | string
        | null) ?? null,
    externalId: charge.externalId,
  };
}

/**
 * Returns the scout's current subscription status.
 * `nextRenewalAt` = `subscriptionExpiresAt - RENEWAL_LEAD_DAYS` or null.
 */
export async function getStatus(
  prisma: PrismaClient,
  scoutId: string,
): Promise<{
  status: string;
  expiresAt: string | null;
  nextRenewalAt: string | null;
}> {
  const scout = await prisma.scoutProfile.findUnique({
    where: { id: scoutId },
    select: { subscriptionStatus: true, subscriptionExpiresAt: true },
  });
  if (!scout) throw new NotFoundError("Scout não encontrado.");

  const expiresAt = scout.subscriptionExpiresAt?.toISOString() ?? null;
  const nextRenewalAt =
    scout.subscriptionExpiresAt !== null
      ? subDays(scout.subscriptionExpiresAt, RENEWAL_LEAD_DAYS).toISOString()
      : null;

  return {
    status: scout.subscriptionStatus,
    expiresAt,
    nextRenewalAt: scout.subscriptionStatus === "ACTIVE" ? nextRenewalAt : null,
  };
}

/**
 * Processes a confirmed scout billing payment (called by the webhook worker).
 *
 * Executes on the public schema only — no `withTenantSchema`.
 * Idempotency: if `scoutBillingPayment` row already exists for the cycle,
 * the P2002 unique constraint will be thrown — caller must catch and skip.
 *
 * Side effect: enqueues a delayed renewal job for the next billing cycle.
 */
export async function handleScoutBillingPaymentConfirmed(
  prisma: PrismaClient,
  input: HandleScoutBillingPaymentInput,
): Promise<void> {
  const {
    scoutId,
    billingCycle,
    gatewayTxId,
    amountCents,
    paidAt,
    externalId,
    gatewayName,
  } = input;

  await prisma.scoutBillingPayment.create({
    data: {
      id: createId(),
      scoutId,
      billingCycle,
      amountCents,
      gatewayTxid: gatewayTxId,
      externalId: externalId ?? null,
      gatewayName: gatewayName ?? null,
      paidAt,
    },
  });

  const subscriptionExpiresAt = addDays(paidAt, SCOUT_SUBSCRIPTION_DAYS);

  await prisma.scoutProfile.update({
    where: { id: scoutId },
    data: {
      subscriptionStatus: "ACTIVE",
      subscriptionExpiresAt,
      updatedAt: new Date(),
    },
  });

  const renewalBillingCycle = formatBillingCycle(subscriptionExpiresAt);
  const renewalDelay =
    subDays(subscriptionExpiresAt, RENEWAL_LEAD_DAYS).getTime() - Date.now();

  const jobData: ScoutSubscriptionRenewalJobData = {
    scoutId,
    billingCycle: renewalBillingCycle,
  };

  await scoutSubscriptionRenewalQueue.add(
    SCOUT_SUBSCRIPTION_RENEWAL_JOB_NAMES.RENEW_SCOUT_SUBSCRIPTION,
    jobData,
    {
      jobId: `scout-renewal:${scoutId}:${renewalBillingCycle}`,
      delay: Math.max(0, renewalDelay),
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    },
  );
}

/**
 * Expires all ACTIVE subscriptions whose `subscriptionExpiresAt` is in the past.
 * Called by the daily expiry cron worker.
 */
export async function expireLapsedSubscriptions(
  prisma: PrismaClient,
): Promise<{ expired: number }> {
  const result = await prisma.scoutProfile.updateMany({
    where: {
      subscriptionStatus: "ACTIVE",
      subscriptionExpiresAt: { lt: new Date() },
    },
    data: { subscriptionStatus: "INACTIVE", updatedAt: new Date() },
  });
  return { expired: result.count };
}
