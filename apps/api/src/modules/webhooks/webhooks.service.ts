import type { Queue } from "bullmq";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import type { WebhookEvent } from "../payments/gateway.interface.js";
import { withTenantSchema } from "../../lib/prisma.js";

export interface WebhookJobData {
  gatewayName: string;
  event: WebhookEvent;
  /** ISO string — when the HTTP request was received by the API */
  receivedAt: string;
  /**
   * Resolved on first processing attempt; stored for retry efficiency.
   * Avoids repeating the full-club scan on every retry attempt.
   */
  clubId?: string;
}

/**
 * Returned by handlePaymentReceived on success.
 */
export interface PaymentReceivedResult {
  paymentId: string;
  chargeId: string;
  memberId: string;
  amountCents: number;
  memberStatusUpdated: boolean;
}

/**
 * Thrown when the Charge referenced by the webhook cannot be found in the
 * tenant schema. This should NOT happen in normal operations — it likely
 * means the chargeId was corrupted or the tenant schema was migrated.
 * Re-throw to let BullMQ retry (transient) or exhaust (permanent).
 */
export class ChargeNotFoundError extends Error {
  constructor(chargeId: string) {
    super(`Charge "${chargeId}" not found in tenant schema`);
    this.name = "ChargeNotFoundError";
  }
}

/**
 * Enqueues a normalised webhook event for async processing by the
 * BullMQ worker (T-027 and beyond).
 *
 * Design decisions:
 * - `jobId` is deterministic on gatewayTxId so BullMQ deduplicates
 *   retransmissions from the PSP within the active job window.
 * - `removeOnComplete` keeps successful jobs for 24 h for debugging.
 * - `removeOnFail` retains failed jobs for 7 days so ops can inspect them.
 *
 * Idempotency at the business layer (duplicate Payment guard) is handled
 * separately in T-028 — this enqueue is intentionally lightweight.
 *
 * @param queue       The BullMQ Queue decorated onto the Fastify instance.
 * @param gatewayName Canonical gateway name (e.g. "asaas").
 * @param event       Normalised WebhookEvent from parseWebhook().
 */
export async function enqueueWebhookEvent(
  queue: Queue<WebhookJobData>,
  gatewayName: string,
  event: WebhookEvent,
): Promise<void> {
  const jobId = `webhook:${gatewayName}:${event.gatewayTxId}`;

  await queue.add(
    "process-webhook",
    {
      gatewayName,
      event,
      receivedAt: new Date().toISOString(),
    },
    {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 7 * 86_400 },
    },
  );
}

/**
 * Checks whether a Payment with the given gatewayTxid already exists
 * in the tenant schema. This is the DB-level idempotency guard (T-028).
 *
 * Called by the webhook worker before creating any Payment row.
 * Returns true  → skip processing (duplicate event).
 * Returns false → safe to proceed.
 *
 * The DB-level @unique constraint on gatewayTxid is a hard safety net;
 * this pre-check avoids a wasted write attempt and provides a clean
 * log entry instead of a constraint violation error.
 *
 * @param prisma      Singleton Prisma client.
 * @param clubId      Tenant identifier.
 * @param gatewayTxid The PSP's transaction/charge identifier.
 */
export async function hasExistingPayment(
  prisma: PrismaClient,
  clubId: string,
  gatewayTxid: string,
): Promise<boolean> {
  const existing = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.payment.findUnique({
      where: { gatewayTxid },
      select: { id: true },
    });
  });
  return existing !== null;
}

/**
 * Resolves the clubId that owns the given chargeId by scanning all tenant
 * schemas for a matching Charge row.
 *
 * Strategy: iterate all clubs; for each club use withTenantSchema to query
 * the tenant's charges table. Returns the clubId of the first match.
 *
 * Performance: acceptable for v1 (tens of clubs, sub-millisecond per query).
 * Future: encode clubId in the charge ID prefix or store a lookup index in
 * the public schema.
 *
 * @param prisma    Singleton Prisma client (public schema access for Club list).
 * @param chargeId  The internal ClubOS charge ID (= event.externalReference).
 * @returns         The clubId string if found, or null if the charge is
 *                  unknown or belongs to a deleted/unregistered tenant.
 */
export async function resolveClubIdFromChargeId(
  prisma: PrismaClient,
  chargeId: string,
): Promise<string | null> {
  const clubs = await prisma.club.findMany({ select: { id: true } });

  for (const club of clubs) {
    try {
      const found = await withTenantSchema(prisma, club.id, async (tx) => {
        return tx.charge.findUnique({
          where: { id: chargeId },
          select: { id: true },
        });
      });
      if (found !== null) {
        return club.id;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Handles a PAYMENT_RECEIVED webhook event.
 *
 * Executes atomically within a single DB transaction:
 *   1. Loads the Charge row (throws ChargeNotFoundError if absent → retry).
 *   2. Guard: returns early if charge is already PAID (idempotency safety net).
 *   3. Creates the Payment row.
 *   4. Updates Charge.status → PAID.
 *   5. Updates Member.status → ACTIVE if it was OVERDUE.
 *   6. Creates an AuditLog entry with action PAYMENT_CONFIRMED.
 *
 * Pre-conditions (enforced by the worker before this call):
 *   - event.type === 'PAYMENT_RECEIVED'
 *   - event.externalReference is non-null (it is the internal chargeId)
 *   - hasExistingPayment() returned false (no duplicate Payment row)
 *
 * @param prisma   Singleton Prisma client.
 * @param clubId   Tenant identifier.
 * @param event    Normalised WebhookEvent (gatewayTxId, externalReference, amountCents).
 * @param actorId  Actor for AuditLog. Defaults to 'system:webhook'.
 */
export async function handlePaymentReceived(
  prisma: PrismaClient,
  clubId: string,
  event: WebhookEvent,
  actorId = "system:webhook",
): Promise<PaymentReceivedResult | { skipped: true; reason: string }> {
  const chargeId = event.externalReference!;

  return withTenantSchema(prisma, clubId, async (tx) => {
    const charge = await tx.charge.findUnique({
      where: { id: chargeId },
      select: {
        id: true,
        memberId: true,
        amountCents: true,
        method: true,
        status: true,
      },
    });

    if (!charge) {
      throw new ChargeNotFoundError(chargeId);
    }

    if (charge.status === "PAID") {
      return { skipped: true as const, reason: "charge_already_paid" };
    }

    const payment = await tx.payment.create({
      data: {
        chargeId: charge.id,
        paidAt: new Date(),
        method: charge.method,
        amountCents: event.amountCents ?? charge.amountCents,
        gatewayTxid: event.gatewayTxId,
      },
    });

    await tx.charge.update({
      where: { id: charge.id },
      data: { status: "PAID", updatedAt: new Date() },
    });

    const member = await tx.member.findUnique({
      where: { id: charge.memberId },
      select: { id: true, status: true },
    });

    let memberStatusUpdated = false;
    if (member?.status === "OVERDUE") {
      await tx.member.update({
        where: { id: charge.memberId },
        data: { status: "ACTIVE", updatedAt: new Date() },
      });
      memberStatusUpdated = true;
    }

    await tx.auditLog.create({
      data: {
        memberId: charge.memberId,
        actorId,
        action: "PAYMENT_CONFIRMED",
        entityId: payment.id,
        entityType: "Payment",
        metadata: {
          chargeId: charge.id,
          paymentId: payment.id,
          amountCents: payment.amountCents,
          gatewayTxid: event.gatewayTxId,
          memberStatusUpdated,
          paidAt: payment.paidAt.toISOString(),
        },
      },
    });

    return {
      paymentId: payment.id,
      chargeId: charge.id,
      memberId: charge.memberId,
      amountCents: payment.amountCents,
      memberStatusUpdated,
    };
  });
}
