import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type { UpdateRtpInput, RtpFullResponse } from "./rtp.schema.js";

export class AthleteNotFoundError extends NotFoundError {
  constructor() {
    super("Atleta não encontrado");
    this.name = "AthleteNotFoundError";
  }
}

export class MedicalRecordNotFoundError extends NotFoundError {
  constructor() {
    super("Prontuário não encontrado");
    this.name = "MedicalRecordNotFoundError";
  }
}

export class ProtocolNotFoundError extends NotFoundError {
  constructor() {
    super("Protocolo não encontrado");
    this.name = "ProtocolNotFoundError";
  }
}

/**
 * Retrieves the RTP record for an athlete.
 *
 * Returns null when no record exists — the athlete has never had an RTP
 * evaluation. Callers should treat null as "no status yet", not as an error.
 *
 * Throws AthleteNotFoundError when the athlete itself does not exist in the
 * tenant schema — this is a hard 404 (wrong ID, not just missing RTP).
 */
export async function getRtp(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
): Promise<RtpFullResponse | null> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: athleteId },
      select: { id: true },
    });
    if (!athlete) throw new AthleteNotFoundError();

    const rtp = await tx.returnToPlay.findUnique({
      where: { athleteId },
    });
    if (!rtp) return null;

    return {
      athleteId: rtp.athleteId,
      status: rtp.status,
      medicalRecordId: rtp.medicalRecordId,
      protocolId: rtp.protocolId,
      clearedAt: rtp.clearedAt?.toISOString() ?? null,
      clearedBy: rtp.clearedBy,
      notes: rtp.notes,
      updatedAt: rtp.updatedAt.toISOString(),
    };
  });
}

/**
 * Creates or updates the RTP record for an athlete (upsert on athleteId).
 *
 * Transition rules:
 *   → LIBERADO:      populate clearedAt (now) and clearedBy (actorId).
 *   ← LIBERADO:      clear clearedAt and clearedBy back to null.
 *   Re-entering LIBERADO (already cleared): preserve existing clearedAt/clearedBy
 *                    so the original clearance timestamp is not overwritten.
 *
 * Optional FK references (medicalRecordId, protocolId) are validated before
 * the upsert — a missing record throws the appropriate NotFoundError.
 *
 * An RTP_STATUS_CHANGED audit log entry is always written, even when the
 * status value does not change (e.g. notes-only update still records intent).
 */
export async function upsertRtp(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  athleteId: string,
  input: UpdateRtpInput,
): Promise<RtpFullResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: athleteId },
      select: { id: true },
    });
    if (!athlete) throw new AthleteNotFoundError();

    if (input.medicalRecordId) {
      const record = await tx.medicalRecord.findUnique({
        where: { id: input.medicalRecordId },
        select: { id: true },
      });
      if (!record) throw new MedicalRecordNotFoundError();
    }

    if (input.protocolId) {
      const protocol = await tx.injuryProtocol.findUnique({
        where: { id: input.protocolId },
        select: { id: true },
      });
      if (!protocol) throw new ProtocolNotFoundError();
    }

    const existing = await tx.returnToPlay.findUnique({
      where: { athleteId },
      select: { status: true, clearedAt: true, clearedBy: true },
    });

    const wasCleared = existing?.status === "LIBERADO";
    const isBeingCleared = input.status === "LIBERADO";
    const isLeavingCleared = input.status !== "LIBERADO";

    const clearedAt: Date | null =
      isBeingCleared && !wasCleared
        ? new Date()
        : isLeavingCleared && wasCleared
          ? null
          : (existing?.clearedAt ?? null);

    const clearedBy: string | null =
      isBeingCleared && !wasCleared
        ? actorId
        : isLeavingCleared && wasCleared
          ? null
          : (existing?.clearedBy ?? null);

    const rtp = await tx.returnToPlay.upsert({
      where: { athleteId },
      create: {
        athleteId,
        status: input.status,
        medicalRecordId: input.medicalRecordId ?? null,
        protocolId: input.protocolId ?? null,
        notes: input.notes ?? null,
        ...(clearedAt !== null ? { clearedAt } : {}),
        ...(clearedBy !== null ? { clearedBy } : {}),
      },
      update: {
        status: input.status,
        ...(input.medicalRecordId !== undefined && {
          medicalRecordId: input.medicalRecordId,
        }),
        ...(input.protocolId !== undefined && {
          protocolId: input.protocolId,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
        clearedAt,
        clearedBy,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "RTP_STATUS_CHANGED" as never,
        entityId: athleteId,
        entityType: "Athlete",
        metadata: {
          previousStatus: existing?.status ?? null,
          newStatus: input.status,
          medicalRecordId: rtp.medicalRecordId,
          protocolId: rtp.protocolId,
          clearedAt: clearedAt?.toISOString() ?? null,
          clearedBy,
        },
      },
    });

    return {
      athleteId: rtp.athleteId,
      status: rtp.status,
      medicalRecordId: rtp.medicalRecordId,
      protocolId: rtp.protocolId,
      clearedAt: rtp.clearedAt?.toISOString() ?? null,
      clearedBy: rtp.clearedBy,
      notes: rtp.notes,
      updatedAt: rtp.updatedAt.toISOString(),
    };
  });
}
