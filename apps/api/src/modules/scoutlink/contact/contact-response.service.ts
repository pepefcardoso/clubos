import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { ConflictError } from "../../../lib/errors.js";
import { assertContactRequestBelongsToClub } from "../../../lib/assert-tenant-ownership.js";
import { emitContactRequestReceivedToScout } from "../../../lib/sse-bus.js";
import { appendCommunicationLog } from "../communication/communication-log.service.js";
import type { RespondContactRequestInput } from "./contact-response.schema.js";
import type { RespondContactRequestResponse } from "@clubos/shared-types";

export async function respondToContactRequest(
  prisma: PrismaClient,
  contactRequestId: string,
  clubId: string,
  actorId: string,
  input: RespondContactRequestInput,
  ip?: string,
): Promise<RespondContactRequestResponse> {
  await assertContactRequestBelongsToClub(prisma, contactRequestId, clubId);

  const cr = await prisma.contactRequest.findUnique({
    where: { id: contactRequestId },
    select: { id: true, scoutId: true, athleteId: true, status: true },
  });

  const { scoutId, athleteId, status } = cr!;

  if (String(status) !== "PENDING") {
    throw new ConflictError(
      `Solicitação já respondida com status: ${String(status)}.`,
    );
  }

  const newStatus = input.action === "ACCEPT" ? "ACCEPTED" : "REJECTED";

  await prisma.contactRequest.update({
    where: { id: contactRequestId },
    data: { status: newStatus, updatedAt: new Date() },
  });

  await appendCommunicationLog(prisma, {
    actorId,
    actorRole: "ADMIN",
    targetId: athleteId,
    eventType:
      input.action === "ACCEPT" ? "CONTACT_ACCEPTED" : "CONTACT_REJECTED",
    metadata: {
      contactRequestId,
      clubId,
      scoutId,
      ...(input.reason != null ? { reason: input.reason } : {}),
    },
    ip,
  });

  emitContactRequestReceivedToScout(scoutId, {
    contactRequestId,
    athleteId,
    status: newStatus,
    reason: input.reason,
  });

  return { contactRequestId, status: newStatus, athleteId, clubId };
}
