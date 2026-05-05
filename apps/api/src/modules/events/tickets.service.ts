import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/index.js";
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
        gatewayMeta: chargeResult.meta,
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

  return {
    ticketId: ticket.id,
    status: "PENDING",
    fanEmail: ticket.fanEmail,
    sectorName: sector.name,
    amountCents: sector.priceCents,
    gatewayMeta: chargeResult.meta,
  };
}
