import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import type { PaginatedResponse } from "@clubos/shared-types";
import { withTenantSchema } from "../../lib/prisma.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import type {
  CreateEventInput,
  EventResponse,
  EventSectorResponse,
  ListEventsQuery,
  UpdateEventInput,
} from "./event-management.schema.js";

export class EventNotFoundError extends NotFoundError {
  constructor() {
    super("Evento não encontrado");
  }
}

export class EventAlreadyCancelledError extends ConflictError {
  constructor() {
    super("Evento já foi cancelado");
  }
}

export async function assertEventBelongsToClub(
  prisma: PrismaClient,
  eventId: string,
): Promise<void> {
  const found = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  });
  if (!found) throw new EventNotFoundError();
}

function toSectorResponse(s: {
  id: string;
  name: string;
  capacity: number;
  sold: number;
  priceCents: number;
}): EventSectorResponse {
  return {
    id: s.id,
    name: s.name,
    capacity: s.capacity,
    sold: s.sold,
    priceCents: s.priceCents,
  };
}

function toEventResponse(event: {
  id: string;
  opponent: string;
  eventDate: Date;
  venue: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sectors: Array<{
    id: string;
    name: string;
    capacity: number;
    sold: number;
    priceCents: number;
  }>;
}): EventResponse {
  return {
    id: event.id,
    opponent: event.opponent,
    eventDate: event.eventDate,
    venue: event.venue,
    description: event.description,
    status: event.status,
    sectors: event.sectors.map(toSectorResponse),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export async function createEvent(
  prisma: PrismaClient,
  clubId: string,
  input: CreateEventInput,
): Promise<EventResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const event = await tx.event.create({
      data: {
        opponent: input.opponent,
        eventDate: new Date(input.eventDate),
        venue: input.venue,
        description: input.description ?? null,
        sectors: {
          create: input.sectors.map((s) => ({
            name: s.name,
            capacity: s.capacity,
            priceCents: s.priceCents,
          })),
        },
      },
      include: { sectors: true },
    });

    return toEventResponse({ ...event, status: String(event.status) });
  });
}

export async function listEvents(
  prisma: PrismaClient,
  clubId: string,
  params: ListEventsQuery,
): Promise<PaginatedResponse<EventResponse>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where: Prisma.EventWhereInput = params.status
      ? { status: params.status }
      : {};

    const [total, rows] = await Promise.all([
      tx.event.count({ where }),
      tx.event.findMany({
        where,
        include: { sectors: true },
        orderBy: { eventDate: "asc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
    ]);

    return {
      data: rows.map((e) =>
        toEventResponse({ ...e, status: String(e.status) }),
      ),
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}

export async function getEventById(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
): Promise<EventResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      include: { sectors: true },
    });
    if (!event) throw new EventNotFoundError();

    return toEventResponse({ ...event, status: String(event.status) });
  });
}

export async function updateEvent(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
  input: UpdateEventInput,
): Promise<EventResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    await assertEventBelongsToClub(tx, eventId);

    const data: Prisma.EventUpdateInput = {};
    if (input.opponent !== undefined) data.opponent = input.opponent;
    if (input.eventDate !== undefined)
      data.eventDate = new Date(input.eventDate);
    if (input.venue !== undefined) data.venue = input.venue;
    if ("description" in input) data.description = input.description ?? null;

    const event = await tx.event.update({
      where: { id: eventId },
      data,
      include: { sectors: true },
    });

    return toEventResponse({ ...event, status: String(event.status) });
  });
}

export async function cancelEvent(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
): Promise<void> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true },
    });
    if (!event) throw new EventNotFoundError();
    if (String(event.status) === "CANCELLED")
      throw new EventAlreadyCancelledError();

    await tx.event.update({
      where: { id: eventId },
      data: { status: "CANCELLED" },
    });
  });
}
