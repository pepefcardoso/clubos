import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import type {
  ListMessagesQuery,
  MessageListResult,
} from "./messages.schema.js";

/**
 * Returns a paginated, optionally filtered list of messages for a club.
 *
 * Used by GET /api/messages to provide the admin audit trail.
 */
export async function listMessages(
  prisma: PrismaClient,
  clubId: string,
  query: ListMessagesQuery,
): Promise<MessageListResult> {
  const { memberId, channel, status, template, dateFrom, dateTo, page, limit } =
    query;

  const where = {
    ...(memberId ? { memberId } : {}),
    ...(channel ? { channel } : {}),
    ...(status ? { status } : {}),
    ...(template ? { template } : {}),
    ...(dateFrom !== undefined || dateTo !== undefined
      ? {
          createdAt: {
            ...(dateFrom !== undefined ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo !== undefined ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  return withTenantSchema(prisma, clubId, async (tx) => {
    const [data, total] = await Promise.all([
      tx.message.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          memberId: true,
          channel: true,
          template: true,
          status: true,
          sentAt: true,
          failReason: true,
          createdAt: true,
        },
      }),
      tx.message.count({ where }),
    ]);

    return { data, total, page, limit };
  });
}

/**
 * Idempotency guard for billing reminder jobs (T-033, T-034).
 *
 * Returns true if a SENT or PENDING message for the given
 * (memberId, template) pair exists within the last `windowHours` hours,
 * indicating the reminder was already dispatched for this cycle.
 *
 * Only FAILED messages are excluded — a failed send should be retried.
 *
 * @param prisma       Singleton Prisma client.
 * @param clubId       Tenant identifier.
 * @param memberId     Internal Member.id.
 * @param template     Template key, e.g. "charge_reminder_d3".
 * @param windowHours  Look-back window in hours (default: 20h — safe margin
 *                     within a daily cron cadence).
 * @param channel      Optional channel filter. When provided, only messages on
 *                     this channel are considered. When omitted, all channels
 *                     are included (original behaviour — backward-compatible).
 */
export async function hasRecentMessage(
  prisma: PrismaClient,
  clubId: string,
  memberId: string,
  template: string,
  windowHours = 20,
  channel?: "WHATSAPP" | "EMAIL",
): Promise<boolean> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const found = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.message.findFirst({
      where: {
        memberId,
        template,
        status: { not: "FAILED" },
        createdAt: { gte: since },
        ...(channel ? { channel } : {}),
      },
      select: { id: true },
    });
  });

  return found !== null;
}

/**
 * Counts FAILED WhatsApp messages for a given (memberId, template) pair
 * within the last `windowHours` hours.
 *
 * Used by the email fallback logic (T-036) to determine whether a second
 * WhatsApp attempt has already been made before escalating to email.
 * When `count >= 1`, the current failure is at least the second attempt,
 * which satisfies the "2 attempts" threshold for email fallback.
 *
 * Only FAILED WhatsApp messages are counted — SENT/PENDING rows are excluded.
 *
 * @param prisma       Singleton Prisma client.
 * @param clubId       Tenant identifier.
 * @param memberId     Internal Member.id.
 * @param template     Template key, e.g. "charge_reminder_d3".
 * @param windowHours  Look-back window in hours (default: 48h — covers two
 *                     daily cron cycles).
 */
export async function countRecentFailedWhatsAppMessages(
  prisma: PrismaClient,
  clubId: string,
  memberId: string,
  template: string,
  windowHours = 48,
): Promise<number> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  return withTenantSchema(prisma, clubId, async (tx) => {
    return tx.message.count({
      where: {
        memberId,
        template,
        channel: "WHATSAPP",
        status: "FAILED",
        createdAt: { gte: since },
      },
    });
  });
}
