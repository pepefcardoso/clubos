import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { hasRecentMessage } from "../../modules/messages/messages.service.js";
import { buildRenderedMessage } from "../../modules//templates/templates.service.js";
import { sendWhatsAppMessage } from "../../modules//whatsapp/whatsapp.service.js";
import { checkAndConsumeWhatsAppRateLimit } from "../../lib/whatsapp-rate-limit.js";
import { TEMPLATE_KEYS } from "../../modules//templates/templates.constants.js";
import { getRedisClient } from "../../lib/redis.js";
import type { GatewayMeta } from "../../modules//charges/charges.schema.js";

export interface ReminderResult {
  clubId: string;
  sent: number;
  skipped: number;
  rateLimited: number;
  errors: Array<{ chargeId: string; memberId: string; reason: string }>;
}

/**
 * Computes the [start, end] UTC Date range for "today + offsetDays".
 *
 * @example
 *   getTargetDayRange(3) on 2025-03-01 → [2025-03-04T00:00:00.000Z, 2025-03-04T23:59:59.999Z]
 *
 * @param offsetDays - Number of days from `now` to target (e.g. 3 for D-3 reminder).
 * @param now        - Reference date. Defaults to current UTC time. Injected in tests.
 */
export function getTargetDayRange(
  offsetDays: number,
  now = new Date(),
): [Date, Date] {
  const base = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
    ),
  );

  const start = new Date(base);

  const end = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  return [start, end];
}

/**
 * Sends D-3 billing reminders via WhatsApp for all eligible PENDING charges
 * in a single club whose dueDate falls within the target day window.
 *
 * Eligibility rules (per charge/member):
 *   1. Charge status must be PENDING.
 *   2. Member status must be ACTIVE.
 *   3. No non-failed message for `charge_reminder_d3` sent within the last 20h
 *      (idempotency guard — prevents duplicate sends on job retry).
 *   4. Per-club WhatsApp rate limit (30 msgs/min) must have an available slot.
 *
 * Error isolation:
 *   - Template render errors are caught per-charge; others continue.
 *   - `sendWhatsAppMessage` FAILED results are recorded in `errors[]`.
 *   - `decryptField` failures inside `sendWhatsAppMessage` are re-thrown so
 *     the BullMQ worker marks the job as failed (system misconfiguration).
 *   - Rate-limited charges are recorded in `errors[]` and `rateLimited` counter.
 *
 * @param prisma          Singleton Prisma client (not a transaction).
 * @param clubId          Tenant identifier.
 * @param targetDateStart UTC start of the D+3 target day (00:00:00.000).
 * @param targetDateEnd   UTC end of the D+3 target day (23:59:59.999).
 */
export async function sendDailyRemindersForClub(
  prisma: PrismaClient,
  clubId: string,
  targetDateStart: Date,
  targetDateEnd: Date,
): Promise<ReminderResult> {
  const redis = getRedisClient();

  const result: ReminderResult = {
    clubId,
    sent: 0,
    skipped: 0,
    rateLimited: 0,
    errors: [],
  };

  const charges = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.charge.findMany({
      where: {
        status: "PENDING",
        dueDate: { gte: targetDateStart, lte: targetDateEnd },
      },
      include: {
        member: {
          select: { id: true, name: true, phone: true, status: true },
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
      TEMPLATE_KEYS.CHARGE_REMINDER_D3,
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
        TEMPLATE_KEYS.CHARGE_REMINDER_D3,
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
          template: TEMPLATE_KEYS.CHARGE_REMINDER_D3,
          renderedBody,
        },
        "system:job:d3-reminder",
      );

      if (sendResult.status === "SENT") {
        result.sent++;
      } else {
        result.errors.push({
          chargeId: charge.id,
          memberId: member.id,
          reason: sendResult.failReason ?? "Unknown send failure",
        });
      }
    } catch (err) {
      throw err;
    }
  }

  return result;
}
