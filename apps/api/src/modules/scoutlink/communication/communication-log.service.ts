import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { Prisma } from "../../../../generated/prisma/index.js";
import { ValidationError } from "../../../lib/errors.js";
import {
  AppendCommunicationLogInputSchema,
  type AppendCommunicationLogInput,
} from "./communication-log.schema.js";

export async function appendCommunicationLog(
  prisma: PrismaClient,
  input: AppendCommunicationLogInput,
): Promise<void> {
  const parsed = AppendCommunicationLogInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid communication log entry.",
    );
  }

  await prisma.communicationLog.create({
    data: {
      id: randomUUID(),
      actorId: parsed.data.actorId,
      actorRole: parsed.data.actorRole,
      targetId: parsed.data.targetId,
      eventType: parsed.data.eventType,
      ip: parsed.data.ip ?? null,
      ...(parsed.data.metadata != null && {
        metadata: parsed.data.metadata as Prisma.JsonObject,
      }),
    },
  });
}
