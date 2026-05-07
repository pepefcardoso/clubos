import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import type { PaginatedResponse } from "@clubos/shared-types";
import { withTenantSchema } from "../../lib/prisma.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../lib/errors.js";
import { saveFile } from "../../lib/storage.js";
import {
  validateImageMagicBytes,
  InvalidMagicBytesError,
} from "../../lib/file-validation.js";
import { assertEventExists } from "../../lib/assert-tenant-ownership.js";
import type {
  CreateEventInput,
  EventResponse,
  EventSectorResponse,
  ListEventsQuery,
  UpdateEventInput,
  UploadSponsorLogoResult,
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

export class InvalidSponsorLogoError extends ValidationError {
  constructor(reason: string) {
    super(reason);
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
  sponsorName: string | null;
  sponsorLogoUrl: string | null;
  sponsorCtaUrl: string | null;
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
    sponsorName: event.sponsorName,
    sponsorLogoUrl: event.sponsorLogoUrl,
    sponsorCtaUrl: event.sponsorCtaUrl,
    sectors: event.sectors.map(toSectorResponse),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

const EVENT_INCLUDE = {
  sectors: true,
} as const;

const EVENT_SELECT_SPONSOR = {
  id: true,
  opponent: true,
  eventDate: true,
  venue: true,
  description: true,
  status: true,
  sponsorName: true,
  sponsorLogoUrl: true,
  sponsorCtaUrl: true,
  createdAt: true,
  updatedAt: true,
  sectors: true,
} as const;

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
        sponsorName: input.sponsorName ?? null,
        sponsorCtaUrl: input.sponsorCtaUrl ?? null,
        sectors: {
          create: input.sectors.map((s) => ({
            name: s.name,
            capacity: s.capacity,
            priceCents: s.priceCents,
          })),
        },
      },
      select: EVENT_SELECT_SPONSOR,
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
        select: EVENT_SELECT_SPONSOR,
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
      select: EVENT_SELECT_SPONSOR,
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
    if ("sponsorName" in input) data.sponsorName = input.sponsorName ?? null;
    if ("sponsorCtaUrl" in input)
      data.sponsorCtaUrl = input.sponsorCtaUrl ?? null;

    const event = await tx.event.update({
      where: { id: eventId },
      data,
      select: EVENT_SELECT_SPONSOR,
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

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MIN_SPONSOR_WIDTH = 200;
const MIN_SPONSOR_HEIGHT = 60;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function uploadEventSponsorLogo(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
  mimetype: string,
  buffer: Buffer,
): Promise<UploadSponsorLogoResult> {
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new InvalidSponsorLogoError("Arquivo excede o limite de 5 MB");
  }

  if (!ALLOWED_MIME_TYPES.has(mimetype)) {
    throw new InvalidSponsorLogoError(
      "Formato inválido. Envie uma imagem JPG, PNG, WebP ou GIF",
    );
  }

  try {
    await validateImageMagicBytes(buffer);
  } catch (err) {
    if (err instanceof InvalidMagicBytesError) {
      throw new InvalidSponsorLogoError(err.message);
    }
    throw err;
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new InvalidSponsorLogoError(
      "Não foi possível processar a imagem enviada",
    );
  }

  if (
    (meta.width ?? 0) < MIN_SPONSOR_WIDTH ||
    (meta.height ?? 0) < MIN_SPONSOR_HEIGHT
  ) {
    throw new InvalidSponsorLogoError(
      `Logo deve ter no mínimo ${MIN_SPONSOR_WIDTH}×${MIN_SPONSOR_HEIGHT}px. ` +
        `Enviado: ${meta.width ?? 0}×${meta.height ?? 0}px`,
    );
  }

  const processed = await sharp(buffer).webp({ quality: 85 }).toBuffer();

  const filename = `sponsor-logo-${eventId}-${randomUUID()}.webp`;
  const sponsorLogoUrl = await saveFile(filename, processed);

  await withTenantSchema(prisma, clubId, async (tx) => {
    await assertEventExists(tx, eventId);
    await tx.event.update({
      where: { id: eventId },
      data: { sponsorLogoUrl },
      select: { id: true },
    });
  });

  return { sponsorLogoUrl };
}
