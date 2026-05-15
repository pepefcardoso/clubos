import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { appendCommunicationLog } from "../communication/communication-log.service.js";
import type { CreateContactRequestInput } from "./contact.schema.js";
import type { CreateContactRequestResponse } from "../../../../../../packages/shared-types/src/index.js";

function differenceInYears(now: Date, birthDate: Date): number {
  const age = now.getFullYear() - birthDate.getFullYear();
  const m = now.getMonth() - birthDate.getMonth();
  return m < 0 || (m === 0 && now.getDate() < birthDate.getDate())
    ? age - 1
    : age;
}

function subDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

export async function createContactRequest(
  prisma: PrismaClient,
  scoutId: string,
  input: CreateContactRequestInput,
  ip?: string,
): Promise<CreateContactRequestResponse> {
  const showcase = await prisma.scoutShowcase.findFirst({
    where: { athleteId: input.athleteId, isPublished: true },
    select: { id: true, clubId: true, athleteId: true },
  });
  if (!showcase) throw new NotFoundError("Showcase não encontrado.");

  const scout = await prisma.scoutProfile.findUnique({
    where: { id: scoutId },
    select: { subscriptionStatus: true, subscriptionExpiresAt: true },
  });
  if (!scout) throw new NotFoundError("Scout não encontrado.");

  const isActiveSubscriber =
    scout.subscriptionStatus === "ACTIVE" &&
    (scout.subscriptionExpiresAt === null ||
      scout.subscriptionExpiresAt > new Date());

  if (!isActiveSubscriber) {
    await appendCommunicationLog(prisma, {
      actorId: scoutId,
      actorRole: "SCOUT",
      targetId: input.athleteId,
      eventType: "CONTACT_BLOCKED_NO_SUBSCRIPTION",
      ip,
    });
    throw new ForbiddenError(
      "Assinatura PREMIUM necessária para solicitar contato.",
    );
  }

  const athlete = await withTenantSchema(
    prisma,
    showcase.clubId,
    async (tx) => {
      return tx.athlete.findUnique({
        where: { id: input.athleteId },
        select: { birthDate: true },
      });
    },
  );
  if (!athlete) throw new NotFoundError("Atleta não encontrado.");

  const ageYears = differenceInYears(new Date(), athlete.birthDate);

  if (ageYears < 18) {
    const consent = await prisma.parentalConsent.findFirst({
      where: { athleteId: input.athleteId, clubId: showcase.clubId },
      select: { id: true },
    });

    if (!consent) {
      await appendCommunicationLog(prisma, {
        actorId: scoutId,
        actorRole: "SCOUT",
        targetId: input.athleteId,
        eventType: "CONTACT_BLOCKED_MINOR",
        ip,
      });

      throw new ForbiddenError(
        "Contato com atleta menor de idade requer consentimento parental registrado.",
      );
    }
  }

  const windowStart = subDays(new Date(), 30);
  const existing = await prisma.contactRequest.findFirst({
    where: {
      scoutId,
      athleteId: input.athleteId,
      createdAt: { gte: windowStart },
    },
    select: { id: true },
  });

  if (existing) {
    await appendCommunicationLog(prisma, {
      actorId: scoutId,
      actorRole: "SCOUT",
      targetId: input.athleteId,
      eventType: "CONTACT_DUPLICATE_BLOCKED",
      ip,
    });
    throw new ConflictError(
      "Solicitação de contato já enviada nos últimos 30 dias.",
    );
  }

  const contactRequest = await prisma.contactRequest.create({
    data: {
      id: randomUUID(),
      scoutId,
      clubId: showcase.clubId,
      athleteId: input.athleteId,
      status: "PENDING",
      reason: input.reason ?? null,
    },
  });

  await appendCommunicationLog(prisma, {
    actorId: scoutId,
    actorRole: "SCOUT",
    targetId: input.athleteId,
    eventType: "CONTACT_REQUEST_CREATED",
    metadata: { contactRequestId: contactRequest.id, clubId: showcase.clubId },
    ip,
  });

  return {
    contactRequestId: contactRequest.id,
    status: "PENDING",
    athleteId: input.athleteId,
    clubId: showcase.clubId,
  };
}
