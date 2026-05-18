import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { Prisma } from "../../../../generated/prisma/index.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors.js";
import { assertShowcaseBelongsToClub } from "../../../lib/assert-tenant-ownership.js";
import { assertValidClubId } from "../../../lib/tenant-schema.js";
import { appendCommunicationLog } from "../communication/communication-log.service.js";
import { emitShowcaseUpdated } from "../../../lib/sse-bus.js";
import type {
  ShowcaseTransferResponse,
  ShowcaseTier,
} from "@clubos/shared-types";
import type { TransferShowcaseBody } from "./showcase-transfer.schema.js";

export async function transferShowcase(
  prisma: PrismaClient,
  sourceClubId: string,
  athleteId: string,
  actorId: string,
  input: TransferShowcaseBody,
): Promise<ShowcaseTransferResponse> {
  const sourceShowcaseId = await assertShowcaseBelongsToClub(
    prisma,
    athleteId,
    sourceClubId,
  );

  assertValidClubId(input.targetClubId);

  if (input.targetClubId === sourceClubId) {
    throw new ConflictError(
      "O clube de destino deve ser diferente do clube de origem.",
    );
  }

  const targetClub = await prisma.club.findUnique({
    where: { id: input.targetClubId },
    select: { id: true },
  });
  if (!targetClub) {
    throw new NotFoundError("Clube de destino não encontrado.");
  }

  const source = await prisma.scoutShowcase.findUnique({
    where: { id: sourceShowcaseId },
  });
  if (!source) throw new NotFoundError("Showcase não encontrado.");

  if (source.transferredAt !== null) {
    throw new ConflictError("Este showcase já foi transferido.");
  }

  const consent = await prisma.parentalConsent.findFirst({
    where: { athleteId, clubId: sourceClubId },
    select: { consentHash: true },
  });
  if (consent !== null) {
    if (!input.consentHash || input.consentHash !== consent.consentHash) {
      throw new ForbiddenError(
        "Hash de consentimento parental inválido ou ausente para atleta menor.",
      );
    }
  }

  const now = new Date();

  const targetShowcase = await prisma.scoutShowcase.upsert({
    where: { clubId_athleteId: { clubId: input.targetClubId, athleteId } },
    update: {
      tier: source.tier,
      snapshot: source.snapshot as Prisma.JsonObject,
      snapshotHash: source.snapshotHash,
      isPublished: source.isPublished,
      publishedAt: source.publishedAt,
      transferredAt: null,
      updatedAt: now,
    },
    create: {
      id: randomUUID(),
      clubId: input.targetClubId,
      athleteId,
      tier: source.tier,
      snapshot: source.snapshot as Prisma.JsonObject,
      snapshotHash: source.snapshotHash,
      isPublished: source.isPublished,
      publishedAt: source.publishedAt,
    },
  });

  await prisma.scoutShowcase.update({
    where: { id: sourceShowcaseId },
    data: { transferredAt: now, updatedAt: now },
  });

  await appendCommunicationLog(prisma, {
    actorId,
    actorRole: "ADMIN",
    targetId: athleteId,
    eventType: "SHOWCASE_TRANSFERRED",
    metadata: {
      sourceClubId,
      targetClubId: input.targetClubId,
      showcaseId: targetShowcase.id,
      sourceShowcaseId,
    },
  });

  emitShowcaseUpdated(sourceClubId, {
    showcaseId: sourceShowcaseId,
    athleteId,
    tier: source.tier as ShowcaseTier,
  });
  emitShowcaseUpdated(input.targetClubId, {
    showcaseId: targetShowcase.id,
    athleteId,
    tier: targetShowcase.tier as ShowcaseTier,
  });

  return {
    showcaseId: targetShowcase.id,
    sourceShowcaseId,
    athleteId,
    sourceClubId,
    targetClubId: input.targetClubId,
    transferredAt: now.toISOString(),
  };
}
