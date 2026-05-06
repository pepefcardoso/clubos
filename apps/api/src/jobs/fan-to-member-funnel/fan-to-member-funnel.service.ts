import type { Redis } from "ioredis";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { sendEmail } from "../../lib/email.js";
import {
  TEMPLATE_KEYS,
  DEFAULT_TEMPLATES,
} from "../../modules/templates/templates.constants.js";
import {
  buildEmailSubject,
  renderedBodyToHtml,
} from "../../modules/email/email-fallback.service.js";
import { formatDate } from "../../modules/templates/templates.service.js";
import type { FanConversionResult } from "./fan-to-member-funnel.types.js";

const FAN_FUNNEL_DEDUP_TTL_SECONDS = 30 * 24 * 60 * 60;

function fanFunnelDedupKey(
  clubId: string,
  fanProfileId: string,
  eventId: string,
): string {
  return `fan_funnel:${clubId}:${fanProfileId}:${eventId}`;
}

/**
 * Sends a fan-to-member conversion email after a successful gate check-in.
 *
 * Idempotency: Redis SET NX per (clubId, fanProfileId, eventId) with 30-day TTL.
 * On email failure the dedup key is cleared so BullMQ retry can re-attempt.
 *
 * The `messages` table is intentionally bypassed — it requires a non-null
 * `memberId` FK and fans are not members. Result is recorded in `audit_log`
 * instead (nullable memberId), consistent with other non-member entities.
 *
 * @param prisma   Singleton Prisma client.
 * @param redis    Singleton Redis client.
 * @param clubId   Tenant identifier (from JWT chain, already validated upstream).
 * @param ticketId Ticket that was checked in — used to resolve fanEmail.
 * @param eventId  Event identifier — included in dedup key and template vars.
 */
export async function sendFanConversionMessage(
  prisma: PrismaClient,
  redis: Redis,
  clubId: string,
  ticketId: string,
  eventId: string,
): Promise<FanConversionResult> {
  const tenantData = await withTenantSchema(prisma, clubId, async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: { fanEmail: true },
    });

    if (!ticket) return null;

    const [fan, event] = await Promise.all([
      tx.fanProfile.findUnique({
        where: { email: ticket.fanEmail },
        select: { id: true, name: true, email: true },
      }),
      tx.event.findUnique({
        where: { id: eventId },
        select: { opponent: true, eventDate: true },
      }),
    ]);

    return fan && event ? { fan, event } : null;
  });

  if (!tenantData) {
    return {
      fanProfileId: ticketId,
      status: "SKIPPED",
      reason: "fan_or_event_not_found",
    };
  }

  const { fan, event } = tenantData;

  const dedupKey = fanFunnelDedupKey(clubId, fan.id, eventId);
  const isNew = await redis.set(
    dedupKey,
    "1",
    "EX",
    FAN_FUNNEL_DEDUP_TTL_SECONDS,
    "NX",
  );
  if (isNew === null) {
    return { fanProfileId: fan.id, status: "SKIPPED", reason: "already_sent" };
  }

  const body = DEFAULT_TEMPLATES[TEMPLATE_KEYS.FAN_CONVERSION]
    .replace(/\{nome\}/g, fan.name)
    .replace(/\{opponent\}/g, event.opponent)
    .replace(/\{eventDate\}/g, formatDate(event.eventDate))
    // TODO: [T-146] replace with per-club membership landing page URL
    .replace(/\{membership_url\}/g, "https://app.clubos.com.br");

  let status: "SENT" | "FAILED" = "FAILED";
  let failReason: string | undefined;

  try {
    await sendEmail({
      to: fan.email,
      subject: buildEmailSubject(TEMPLATE_KEYS.FAN_CONVERSION),
      html: renderedBodyToHtml(body),
      text: body,
    });
    status = "SENT";
  } catch (err) {
    status = "FAILED";
    failReason = err instanceof Error ? err.message : "Unknown email error";
    await redis.del(dedupKey);
  }

  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId: "system:job:fan-funnel",
        action: "MESSAGE_SENT",
        entityId: fan.id,
        entityType: "FanProfile",
        metadata: {
          channel: "EMAIL",
          template: TEMPLATE_KEYS.FAN_CONVERSION,
          eventId,
          ticketId,
          status,
          failReason: failReason ?? null,
        },
      },
    });
  });

  if (status === "SENT") {
    return { fanProfileId: fan.id, status: "SENT" };
  }

  return {
    fanProfileId: fan.id,
    status: "FAILED",
    reason: failReason ?? "unknown",
  };
}
