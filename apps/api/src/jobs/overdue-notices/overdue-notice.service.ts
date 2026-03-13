import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import {
  hasRecentMessage,
  countRecentFailedWhatsAppMessages,
} from "../../modules/messages/messages.service.js";
import { buildRenderedMessage } from "../../modules/templates/templates.service.js";
import { sendWhatsAppMessage } from "../../modules/whatsapp/whatsapp.service.js";
import { checkAndConsumeWhatsAppRateLimit } from "../../lib/whatsapp-rate-limit.js";
import { TEMPLATE_KEYS } from "../../modules/templates/templates.constants.js";
import { getRedisClient } from "../../lib/redis.js";
import { getTargetDayRange } from "../job-utils.js";
import type { GatewayMeta } from "../../modules/charges/charges.schema.js";
import { sendEmailFallbackMessage } from "../../modules/email/email-fallback.service.js";

export { getTargetDayRange };

export interface OverdueNoticeResult {
  clubId: string;
  sent: number;
  skipped: number;
  rateLimited: number;
  emailFallbacks: number;
  errors: Array<{ chargeId: string; memberId: string; reason: string }>;
}

/**
 * Sends D+3 overdue notices via WhatsApp for all eligible charges in a single
 * club whose dueDate falls within the target day (3 days ago) and are still unpaid.
 *
 * Eligibility rules (per charge/member):
 *   1. Charge status must be PENDING or OVERDUE.
 *   2. Member status must be ACTIVE.
 *   3. No non-failed message for `overdue_notice` sent within the last 20h
 *      (idempotency guard — prevents duplicate sends on job retry).
 *   4. Per-club WhatsApp rate limit (30 msgs/min) must have an available slot.
 *
 * Email fallback:
 *   When a WhatsApp send fails AND the member has an email address AND there is
 *   already at least 1 prior FAILED WhatsApp message within 48h for the same
 *   template, an email is sent via Resend as a fallback — provided no email has
 *   been dispatched in the last 20h.
 *
 * Error isolation:
 *   - Template render errors are caught per-charge; processing continues.
 *   - `sendWhatsAppMessage` FAILED results are recorded in `errors[]` (or escalated
 *     to email fallback when eligible).
 *   - `decryptField` failures inside `sendWhatsAppMessage` are re-thrown so
 *     the BullMQ worker marks the job as failed (system misconfiguration).
 *   - Rate-limited charges are recorded in `errors[]` and `rateLimited` counter.
 *
 * @param prisma          Singleton Prisma client (not a transaction).
 * @param clubId          Tenant identifier.
 * @param targetDateStart UTC start of the D-3 target day (00:00:00.000).
 * @param targetDateEnd   UTC end of the D-3 target day (23:59:59.999).
 */
export async function sendOverdueNoticesForClub(
  prisma: PrismaClient,
  clubId: string,
  targetDateStart: Date,
  targetDateEnd: Date,
): Promise<OverdueNoticeResult> {
  const redis = getRedisClient();

  const result: OverdueNoticeResult = {
    clubId,
    sent: 0,
    skipped: 0,
    rateLimited: 0,
    emailFallbacks: 0,
    errors: [],
  };

  const charges = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.charge.findMany({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        dueDate: { gte: targetDateStart, lte: targetDateEnd },
      },
      include: {
        member: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
          },
        },
      },
    });
  });

  for (const charge of charges) {
    const member = charge.member;

    if (member.status !== "ACTIVE") {
      result.skipped++;
      continue;
    }

    const alreadySent = await hasRecentMessage(
      prisma,
      clubId,
      member.id,
      TEMPLATE_KEYS.OVERDUE_NOTICE,
      20,
    );
    if (alreadySent) {
      result.skipped++;
      continue;
    }

    const rateCheck = await checkAndConsumeWhatsAppRateLimit(redis, clubId);
    if (!rateCheck.allowed) {
      result.rateLimited++;
      result.errors.push({
        chargeId: charge.id,
        memberId: member.id,
        reason: `Rate limited — retry after ${rateCheck.retryAfterMs}ms`,
      });
      continue;
    }

    let renderedBody: string;
    try {
      renderedBody = await buildRenderedMessage(
        prisma,
        clubId,
        TEMPLATE_KEYS.OVERDUE_NOTICE,
        {
          amountCents: charge.amountCents,
          dueDate: charge.dueDate,
          gatewayMeta: charge.gatewayMeta as GatewayMeta | null | undefined,
        },
        member.name,
      );
    } catch (err) {
      result.errors.push({
        chargeId: charge.id,
        memberId: member.id,
        reason: err instanceof Error ? err.message : "Template render error",
      });
      continue;
    }

    try {
      const sendResult = await sendWhatsAppMessage(
        prisma,
        {
          clubId,
          memberId: member.id,
          encryptedPhone: member.phone as unknown as Uint8Array,
          template: TEMPLATE_KEYS.OVERDUE_NOTICE,
          renderedBody,
        },
        "system:job:overdue-notice",
      );

      if (sendResult.status === "SENT") {
        result.sent++;
      } else {
        const memberEmail = member.email;

        if (memberEmail) {
          const [priorFailures, emailAlreadySent] = await Promise.all([
            countRecentFailedWhatsAppMessages(
              prisma,
              clubId,
              member.id,
              TEMPLATE_KEYS.OVERDUE_NOTICE,
              48,
            ),
            hasRecentMessage(
              prisma,
              clubId,
              member.id,
              TEMPLATE_KEYS.OVERDUE_NOTICE,
              20,
              "EMAIL",
            ),
          ]);

          if (priorFailures >= 1 && !emailAlreadySent) {
            try {
              const fallbackResult = await sendEmailFallbackMessage(
                prisma,
                {
                  clubId,
                  memberId: member.id,
                  memberName: member.name,
                  memberEmail,
                  template: TEMPLATE_KEYS.OVERDUE_NOTICE,
                  charge: {
                    amountCents: charge.amountCents,
                    dueDate: charge.dueDate,
                    gatewayMeta: charge.gatewayMeta as
                      | GatewayMeta
                      | null
                      | undefined,
                  },
                },
                "system:job:overdue-notice",
              );

              if (fallbackResult.status === "SENT") {
                result.emailFallbacks++;
              } else {
                result.errors.push({
                  chargeId: charge.id,
                  memberId: member.id,
                  reason: `WhatsApp FAILED; email fallback also FAILED: ${fallbackResult.failReason ?? "unknown"}`,
                });
              }
            } catch (err) {
              result.errors.push({
                chargeId: charge.id,
                memberId: member.id,
                reason: `WhatsApp FAILED; email fallback threw: ${err instanceof Error ? err.message : "unknown"}`,
              });
            }
          } else {
            result.errors.push({
              chargeId: charge.id,
              memberId: member.id,
              reason: sendResult.failReason ?? "Unknown send failure",
            });
          }
        } else {
          result.errors.push({
            chargeId: charge.id,
            memberId: member.id,
            reason: sendResult.failReason ?? "Unknown send failure",
          });
        }
      }
    } catch (err) {
      throw err;
    }
  }

  return result;
}
