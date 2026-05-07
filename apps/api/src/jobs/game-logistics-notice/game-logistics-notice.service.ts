import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { sendEmail } from "../../lib/email.js";
import { buildGameLogisticsEmail } from "./game-logistics-notice.email.js";
import type { GameLogisticsNoticeResult } from "./game-logistics-notice.types.js";

/**
 * Sends a 48h-before-kickoff logistics notice to all ADMIN users of a club.
 *
 * Public-schema queries (club, users) run directly on `prisma` — no `withTenantSchema`.
 * Tenant-schema queries (event, athletes) run inside `withTenantSchema` [SEC-TEN].
 *
 * Skips gracefully when:
 *   - Club not found
 *   - No ADMIN users
 *   - Event not found or already CANCELLED
 *
 * Per-recipient email errors are isolated — one failure does not block others.
 */
export async function sendGameLogisticsNotice(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
): Promise<GameLogisticsNoticeResult> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  });
  if (!club) {
    return { clubId, sent: 0, skipped: 1, reason: "club_not_found" };
  }

  const adminUsers = await prisma.user.findMany({
    where: { clubId, role: "ADMIN" },
    select: { email: true },
  });
  if (adminUsers.length === 0) {
    return { clubId, sent: 0, skipped: 1, reason: "no_admin_users" };
  }

  const tenantData = await withTenantSchema(prisma, clubId, async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: {
        opponent: true,
        eventDate: true,
        venue: true,
        status: true,
      },
    });

    if (!event || String(event.status) === "CANCELLED") {
      return {
        event: null,
        athletes: [] as Array<{ name: string; position: string | null }>,
      };
    }

    const athletes = await tx.athlete.findMany({
      where: { status: "ACTIVE" },
      select: { name: true, position: true },
      orderBy: { name: "asc" },
    });

    return { event, athletes };
  });

  if (!tenantData.event) {
    return {
      clubId,
      sent: 0,
      skipped: 1,
      reason: "event_not_found_or_cancelled",
    };
  }

  const { subject, html, text } = buildGameLogisticsEmail({
    clubName: club.name,
    event: tenantData.event,
    athletes: tenantData.athletes,
  });

  let sent = 0;
  const errors: string[] = [];

  for (const user of adminUsers) {
    try {
      await sendEmail({ to: user.email, subject, html, text });
      sent++;
    } catch (err) {
      errors.push(
        `${user.email}: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  return { clubId, sent, skipped: 0, errors };
}
