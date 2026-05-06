import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { verifyQrToken } from "../../lib/qr-token.js";
import { withTenantSchema } from "../../lib/prisma.js";
import {
  assertEventExists,
  assertTicketExists,
} from "../../lib/assert-tenant-ownership.js";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../../lib/errors.js";
import { emitCheckinConfirmed } from "../../lib/sse-bus.js";
import type { ValidateTicketResponse } from "./tickets.validate.schema.js";
import { fanFunnelQueue } from "../../jobs/queues.js";
import { FAN_FUNNEL_JOB_NAMES } from "../../jobs/fan-to-member-funnel/fan-to-member-funnel.types.js";

const SCAN_DEDUP_TTL_SECONDS = 24 * 60 * 60;

function scanDedupKey(ticketId: string): string {
  return `ticket:scan:${ticketId}`;
}

export class TicketAlreadyScannedError extends ConflictError {
  constructor() {
    super("Ingresso já utilizado.");
  }
}

export class InvalidQrTokenError extends ValidationError {
  constructor() {
    super("QR Code inválido ou expirado.");
  }
}

export class TicketNotValidForEntryError extends ValidationError {
  constructor(reason: string) {
    super(reason);
  }
}

interface QrPayload {
  ticketId: string;
  eventId: string;
  clubId: string;
  t: string;
}

function parseQrPayload(raw: string): QrPayload | null {
  try {
    const p = JSON.parse(raw) as unknown;
    if (
      typeof p !== "object" ||
      p === null ||
      typeof (p as Record<string, unknown>)["ticketId"] !== "string" ||
      typeof (p as Record<string, unknown>)["eventId"] !== "string" ||
      typeof (p as Record<string, unknown>)["clubId"] !== "string" ||
      typeof (p as Record<string, unknown>)["t"] !== "string"
    )
      return null;
    return p as QrPayload;
  } catch {
    return null;
  }
}

export async function validateTicket(
  prisma: PrismaClient,
  redis: Redis,
  clubId: string,
  eventId: string,
  actorId: string,
  ipAddress: string | undefined,
  userAgent: string | undefined,
  qrPayload: string,
): Promise<ValidateTicketResponse> {
  const parsed = parseQrPayload(qrPayload);
  if (!parsed) throw new InvalidQrTokenError();

  if (parsed.eventId !== eventId || parsed.clubId !== clubId) {
    throw new InvalidQrTokenError();
  }

  const tokenValid = verifyQrToken(parsed.t, parsed.ticketId, parsed.eventId);
  if (!tokenValid) {
    await withTenantSchema(prisma, clubId, async (tx) => {
      await tx.fieldAccessLog.create({
        data: {
          id: randomUUID(),
          eventId,
          scannedBy: actorId,
          payload: qrPayload,
          isValid: false,
          rejectionReason: "invalid_hmac",
          scannedAt: new Date(),
          createdAt: new Date(),
        },
      });
    });
    throw new InvalidQrTokenError();
  }

  const dedupKey = scanDedupKey(parsed.ticketId);
  const isNew = await redis.set(
    dedupKey,
    actorId,
    "EX",
    SCAN_DEDUP_TTL_SECONDS,
    "NX",
  );
  if (isNew === null) {
    throw new TicketAlreadyScannedError();
  }

  const result = await withTenantSchema(prisma, clubId, async (tx) => {
    await assertEventExists(tx, eventId);
    await assertTicketExists(tx, parsed.ticketId);

    const ticket = await tx.ticket.findUnique({
      where: { id: parsed.ticketId },
      select: {
        id: true,
        eventId: true,
        status: true,
        checkedIn: true,
        fanName: true,
        sector: { select: { name: true } },
      },
    });

    const t = ticket!;

    if (t.eventId !== eventId) {
      throw new NotFoundError("Ingresso não encontrado.");
    }

    if (String(t.status) === "CANCELLED") {
      throw new TicketNotValidForEntryError("Ingresso cancelado.");
    }

    if (String(t.status) !== "PAID") {
      throw new TicketNotValidForEntryError("Pagamento não confirmado.");
    }

    if (t.checkedIn) {
      throw new TicketAlreadyScannedError();
    }

    const checkedInAt = new Date();

    await tx.ticket.update({
      where: { id: parsed.ticketId },
      data: { checkedIn: true, checkedInAt, updatedAt: checkedInAt },
    });

    await tx.fieldAccessLog.create({
      data: {
        id: randomUUID(),
        eventId,
        scannedBy: actorId,
        payload: qrPayload,
        isValid: true,
        idempotencyKey: parsed.ticketId,
        ipAddress,
        userAgent,
        scannedAt: checkedInAt,
        createdAt: checkedInAt,
      },
    });

    return {
      ticketId: parsed.ticketId,
      fanName: t.fanName,
      sectorName: t.sector.name,
      eventId,
      checkedInAt: checkedInAt.toISOString(),
    };
  });

  emitCheckinConfirmed(clubId, {
    ticketId: result.ticketId,
    eventId,
    fanName: result.fanName,
    sectorName: result.sectorName,
    checkedInAt: result.checkedInAt,
  });

  fanFunnelQueue
    .add(
      FAN_FUNNEL_JOB_NAMES.SEND_FAN_CONVERSION,
      { ticketId: parsed.ticketId, eventId, clubId },
      { jobId: `fan-funnel:${parsed.ticketId}` },
    )
    .catch((err: unknown) => {
      console.error(
        "[fan-funnel] Failed to enqueue for ticket",
        parsed.ticketId,
        err instanceof Error ? err.message : err,
      );
    });

  return result;
}
