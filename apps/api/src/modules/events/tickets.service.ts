import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../../generated/prisma/index.js";
import {
  withTenantSchema,
  isPrismaUniqueConstraintError,
} from "../../lib/prisma.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { GatewayRegistry } from "../payments/gateway.registry.js";
import {
  assertEventExists,
  assertEventSectorExists,
} from "../../lib/assert-tenant-ownership.js";
import type {
  PurchaseTicketInput,
  PurchaseTicketResponse,
} from "./tickets.schema.js";
import { ConflictError } from "../../lib/errors.js";
import { assertTicketExists } from "../../lib/assert-tenant-ownership.js";
import { emitTicketSold, emitEventCapacityUpdated } from "../../lib/sse-bus.js";

export interface PublicEventDetails {
  id: string;
  opponent: string;
  eventDate: string;
  venue: string;
  description: string | null;
  status: string;
  sectors: Array<{
    id: string;
    name: string;
    priceCents: number;
    capacity: number;
    available: number;
  }>;
}

export async function getPublicEventDetails(
  prisma: PrismaClient,
  clubSlug: string,
  eventId: string,
): Promise<PublicEventDetails> {
  const club = await prisma.club.findUnique({
    where: { slug: clubSlug },
    select: { id: true },
  });
  if (!club) throw new NotFoundError("Clube não encontrado.");

  const event = await withTenantSchema(prisma, club.id, async (tx) => {
    return tx.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        opponent: true,
        eventDate: true,
        venue: true,
        description: true,
        status: true,
        sectors: {
          select: {
            id: true,
            name: true,
            priceCents: true,
            capacity: true,
            sold: true,
          },
        },
      },
    });
  });

  if (!event) throw new NotFoundError("Evento não encontrado.");
  if (String(event.status) === "CANCELLED")
    throw new NotFoundError("Evento não disponível.");

  return {
    id: event.id,
    opponent: event.opponent,
    eventDate: event.eventDate.toISOString(),
    venue: event.venue,
    description: event.description,
    status: String(event.status),
    sectors: event.sectors.map((s) => ({
      id: s.id,
      name: s.name,
      priceCents: s.priceCents,
      capacity: s.capacity,
      available: s.capacity - s.sold,
    })),
  };
}

export async function purchaseTicket(
  prisma: PrismaClient,
  clubSlug: string,
  eventId: string,
  input: PurchaseTicketInput,
): Promise<PurchaseTicketResponse> {
  const club = await prisma.club.findUnique({
    where: { slug: clubSlug },
    select: { id: true },
  });
  if (!club) throw new NotFoundError("Clube não encontrado.");

  const { ticket, sector } = await withTenantSchema(
    prisma,
    club.id,
    async (tx) => {
      await assertEventExists(tx, eventId);

      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { status: true },
      });
      if (String(event?.status) !== "SCHEDULED") {
        throw new ValidationError("Evento não está disponível para compra.");
      }

      await assertEventSectorExists(tx, input.sectorId, eventId);

      const sector = await tx.eventSector.findUnique({
        where: { id: input.sectorId },
        select: {
          id: true,
          name: true,
          capacity: true,
          sold: true,
          priceCents: true,
        },
      });
      if (!sector) throw new NotFoundError("Setor não encontrado.");

      if (sector.sold >= sector.capacity) {
        throw new ValidationError("Setor sem capacidade disponível.");
      }

      let ticket: { id: string; fanEmail: string };
      try {
        ticket = await tx.ticket.create({
          data: {
            id: randomUUID(),
            eventId,
            sectorId: input.sectorId,
            fanEmail: input.fanEmail,
            fanName: input.fanName,
            status: "PENDING",
            updatedAt: new Date(),
          },
          select: { id: true, fanEmail: true },
        });
      } catch (err) {
        if (isPrismaUniqueConstraintError(err)) {
          const existing = await tx.ticket.findFirst({
            where: {
              fanEmail: input.fanEmail,
              eventId,
              sectorId: input.sectorId,
            },
            select: { id: true, fanEmail: true },
          });
          if (!existing) throw err;
          return { ticket: existing, sector } as const;
        }
        throw err;
      }

      return { ticket, sector } as const;
    },
  );

  const gateway = GatewayRegistry.forMethod("PIX");

  const chargeResult = await gateway.createCharge({
    amountCents: sector.priceCents,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1_000),
    method: "PIX",
    customer: {
      name: input.fanName,
      cpf: input.fanCpf,
      phone: input.fanPhone,
      email: input.fanEmail,
    },
    description: `Ingresso — ${sector.name}`,
    idempotencyKey: ticket.id,
    externalReference: `ticket:${ticket.id}`,
  });

  await withTenantSchema(prisma, club.id, async (tx) => {
    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        externalId: chargeResult.externalId,
        gatewayName: gateway.name,
        gatewayMeta: chargeResult.meta as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  });

  // TODO: [T-146] — move FanProfile enrichment to a dedicated CRM service
  withTenantSchema(prisma, club.id, async (tx) => {
    await tx.fanProfile.upsert({
      where: { email: input.fanEmail },
      create: {
        id: randomUUID(),
        name: input.fanName,
        email: input.fanEmail,
        phone: input.fanPhone,
        eventIds: [eventId],
        updatedAt: new Date(),
      },
      update: {
        phone: input.fanPhone,
        eventIds: { push: eventId },
        updatedAt: new Date(),
      },
    });
  }).catch((err: unknown) => {
    console.error(
      "[tickets] FanProfile upsert failed:",
      err instanceof Error ? err.message : err,
    );
  });

  emitTicketSold(club.id, {
    ticketId: ticket.id,
    eventId,
    sectorId: input.sectorId,
    sectorName: sector.name,
    fanName: input.fanName,
  });

  emitEventCapacityUpdated(club.id, {
    eventId,
    sectorId: input.sectorId,
    sold: sector.sold + 1,
    capacity: sector.capacity,
    available: sector.capacity - sector.sold - 1,
  });

  return {
    ticketId: ticket.id,
    status: "PENDING",
    fanEmail: ticket.fanEmail,
    sectorName: sector.name,
    amountCents: sector.priceCents,
    gatewayMeta: chargeResult.meta,
  };
}

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1_000;

export class TicketAlreadyCancelledError extends ConflictError {
  constructor() {
    super("Ingresso já cancelado.");
  }
}

export class TicketCheckedInError extends ValidationError {
  constructor() {
    super("Ingresso já utilizado na portaria.");
  }
}

export class TicketCancellationWindowError extends ValidationError {
  constructor() {
    super("Cancelamento não permitido dentro de 24h do evento.");
  }
}

/**
 * Cancels a ticket and, when the ticket has an associated gateway charge,
 * requests a refund via the registered gateway.
 *
 * Invariants enforced inside a single tenant transaction:
 *   - ticket must exist in caller's tenant schema      [SEC-OBJ]
 *   - ticket must not be checked in
 *   - ticket must not already be CANCELLED
 *   - event must be more than 24h away
 *   - event_sectors.sold is decremented atomically
 *   - Payment row is soft-cancelled (cancelledAt set), never deleted   [FIN]
 *   - AuditLog row created with action TICKET_CANCELLED
 *
 * Gateway call (cancelCharge) happens OUTSIDE the transaction to avoid
 * holding a DB lock during a network round-trip. If the gateway call fails,
 * the ticket remains in its current state (no partial update) and the error
 * propagates to the route handler.
 */
export async function cancelTicket(
  prisma: PrismaClient,
  clubId: string,
  ticketId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const snapshot = await withTenantSchema(prisma, clubId, async (tx) => {
    await assertTicketExists(tx, ticketId);

    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        eventId: true,
        status: true,
        checkedIn: true,
        sectorId: true,
        externalId: true,
        gatewayName: true,
        event: { select: { eventDate: true } },
      },
    });

    const t = ticket!;

    if (t.checkedIn) throw new TicketCheckedInError();
    if (String(t.status) === "CANCELLED")
      throw new TicketAlreadyCancelledError();

    const msUntilEvent = t.event.eventDate.getTime() - Date.now();
    if (msUntilEvent < CANCELLATION_WINDOW_MS) {
      throw new TicketCancellationWindowError();
    }

    return {
      eventId: t.eventId,
      sectorId: t.sectorId,
      externalId: t.externalId,
      gatewayName: t.gatewayName,
      status: String(t.status) as "PENDING" | "PAID",
    };
  });

  if (snapshot.externalId && snapshot.gatewayName) {
    const gateway = GatewayRegistry.get(snapshot.gatewayName);
    await gateway.cancelCharge(snapshot.externalId, reason);
  }

  const { updatedSector } = await withTenantSchema(
    prisma,
    clubId,
    async (tx) => {
      if (snapshot.externalId && snapshot.gatewayName) {
        const charge = await tx.charge.findFirst({
          where: { externalId: snapshot.externalId },
          select: { id: true },
        });
        if (charge) {
          await tx.payment.updateMany({
            where: { chargeId: charge.id, cancelledAt: null },
            data: { cancelledAt: new Date(), cancelReason: reason },
          });
        }
      }

      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: "CANCELLED", updatedAt: new Date() },
      });

      await tx.eventSector.update({
        where: { id: snapshot.sectorId },
        data: { sold: { decrement: 1 }, updatedAt: new Date() },
      });

      const updatedSector = await tx.eventSector.findUnique({
        where: { id: snapshot.sectorId },
        select: { sold: true, capacity: true },
      });

      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          actorId,
          action: "TICKET_CANCELLED",
          entityId: ticketId,
          entityType: "Ticket",
          metadata: {
            reason,
            hadExternalCharge: Boolean(snapshot.externalId),
            gatewayName: snapshot.gatewayName ?? null,
            previousStatus: snapshot.status,
          },
          createdAt: new Date(),
        },
      });

      return { updatedSector };
    },
  );

  if (updatedSector) {
    emitEventCapacityUpdated(clubId, {
      eventId: snapshot.eventId,
      sectorId: snapshot.sectorId,
      sold: updatedSector.sold,
      capacity: updatedSector.capacity,
      available: updatedSector.capacity - updatedSector.sold,
    });
  }
}
