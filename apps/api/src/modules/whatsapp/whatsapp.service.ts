import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { decryptField } from "../../lib/crypto.js";
import { WhatsAppRegistry } from "./whatsapp.registry.js";
import { WhatsAppProviderError } from "./whatsapp.interface.js";

export interface SendWhatsAppMessageInput {
  /** Tenant identifier. */
  clubId: string;
  /** Internal Member.id — used for Message.memberId and AuditLog.memberId. */
  memberId: string;
  /** Raw encrypted phone bytes read directly from the Member row. */
  encryptedPhone: Uint8Array;
  /**
   * Template identifier stored in Message.template, e.g.:
   *   "charge_reminder_d3" | "charge_reminder_d0" | "overdue_notice"
   */
  template: string;
  /**
   * Fully rendered message body with member variables already substituted.
   * Variable interpolation is the caller's responsibility.
   */
  renderedBody: string;
}

export interface SendWhatsAppMessageResult {
  /** Internal Message.id — use as correlation ID in job logging. */
  messageId: string;
  status: "SENT" | "FAILED";
  /** Provider-specific message ID; present when status === 'SENT'. */
  providerMessageId?: string | undefined;
  /** Human-readable failure reason; present when status === 'FAILED'. */
  failReason?: string | undefined;
}

/**
 * Sends a WhatsApp message to a single club member and persists the result.
 *
 * Execution steps:
 *   1. Decrypt phone — re-throws on failure (system misconfiguration)
 *   2. Normalise phone (strip non-digits)
 *   3. Create Message row with status PENDING
 *   4. Call WhatsAppRegistry.get().sendMessage()
 *   5. Update Message to SENT or FAILED
 *   6. Create AuditLog entry (action = MESSAGE_SENT)
 *
 * Error handling contract:
 *   - Provider errors → captured → result.status = 'FAILED', no re-throw
 *   - decryptField errors → re-thrown (indicates system misconfiguration,
 *     not a transient failure — callers should not retry blindly)
 *
 * Rate limiting is NOT implemented here. BullMQ job callers (T-035) are
 * responsible for enforcing the 30 messages/minute per club Redis sliding
 * window before invoking this function.
 *
 * @param prisma    Singleton Prisma client (not a transaction).
 * @param input     Message parameters including the raw encrypted phone bytes.
 * @param actorId   Actor written to AuditLog. Defaults to "system:job".
 */
export async function sendWhatsAppMessage(
  prisma: PrismaClient,
  input: SendWhatsAppMessageInput,
  actorId = "system:job",
): Promise<SendWhatsAppMessageResult> {
  const phone = await withTenantSchema(prisma, input.clubId, (tx) =>
    decryptField(tx, input.encryptedPhone),
  );

  const normalizedPhone = phone.replace(/\D/g, "");

  return withTenantSchema(prisma, input.clubId, async (tx) => {
    const message = await tx.message.create({
      data: {
        memberId: input.memberId,
        channel: "WHATSAPP",
        template: input.template,
        status: "PENDING",
      },
    });

    let status: "SENT" | "FAILED" = "FAILED";
    let providerMessageId: string | undefined;
    let failReason: string | undefined;

    try {
      const provider = WhatsAppRegistry.get();
      const result = await provider.sendMessage({
        phone: normalizedPhone,
        body: input.renderedBody,
        idempotencyKey: message.id,
      });
      status = "SENT";
      providerMessageId = result.providerMessageId;
    } catch (err) {
      status = "FAILED";
      if (err instanceof WhatsAppProviderError) {
        failReason = err.message;
      } else if (err instanceof Error) {
        failReason = err.message;
      } else {
        failReason = "Unknown provider error";
      }
    }

    await tx.message.update({
      where: { id: message.id },
      data: {
        status,
        ...(status === "SENT" ? { sentAt: new Date() } : {}),
        ...(failReason !== undefined ? { failReason } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        memberId: input.memberId,
        actorId,
        action: "MESSAGE_SENT",
        entityId: message.id,
        entityType: "Message",
        metadata: {
          channel: "WHATSAPP",
          template: input.template,
          status,
          providerMessageId: providerMessageId ?? null,
          failReason: failReason ?? null,
        },
      },
    });

    return {
      messageId: message.id,
      status,
      providerMessageId,
      failReason,
    };
  });
}
