import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import { encryptField, decryptField } from "../../lib/crypto.js";
import type {
  CreateMedicalRecordInput,
  UpdateMedicalRecordInput,
  ListMedicalRecordsQuery,
  MedicalRecordResponse,
  MedicalRecordSummary,
} from "./medical-records.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";

export class MedicalRecordNotFoundError extends NotFoundError {
  constructor() {
    super("Prontuário não encontrado");
    this.name = "MedicalRecordNotFoundError";
  }
}

export class AthleteNotFoundError extends NotFoundError {
  constructor() {
    super("Atleta não encontrado");
    this.name = "AthleteNotFoundError";
  }
}

export class ProtocolNotFoundError extends NotFoundError {
  constructor() {
    super("Protocolo não encontrado");
    this.name = "ProtocolNotFoundError";
  }
}

/**
 * IP address and User-Agent forwarded from the HTTP request, used to populate
 * data_access_log entries for LGPD compliance (Art. 37).
 */
export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Standardized action strings for data_access_log entries on medical records.
 * These are TEXT (not an enum) — new values can be added without DDL migrations.
 * Used for LGPD Art. 37 compliance audit trail.
 */
const DATA_ACCESS_ACTIONS = {
  /** getMedicalRecordById — full clinical field decrypt */
  READ: "READ",
  /** listMedicalRecords — no clinical field decryption, but access is still logged */
  LIST: "LIST",
  /** updateMedicalRecord — decrypt of post-update clinical field state */
  UPDATE_READ: "UPDATE_READ",
  /** deleteMedicalRecord — metadata read before hard delete (no clinical decrypt) */
  DELETE_ACCESS: "DELETE_ACCESS",
} as const;

type RawRecordRow = {
  id: string;
  athleteId: string;
  protocolId: string | null;
  occurredAt: Date;
  structure: string;
  grade: string;
  mechanism: string;
  clinicalNotes: Uint8Array | null;
  diagnosis: Uint8Array | null;
  treatmentDetails: Uint8Array | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  athlete: { name: string };
};

/**
 * Creates a new injury medical record for an athlete.
 *
 * Validates:
 *   - The athlete must exist in the tenant schema.
 *   - The protocol (if provided) must exist in the tenant schema.
 *
 * Encrypts `clinicalNotes`, `diagnosis`, and `treatmentDetails` at rest using
 * AES-256 via pgcrypto before persisting. Only fields that are provided are
 * encrypted — null/undefined fields are stored as NULL.
 *
 * Writes a `MEDICAL_RECORD_CREATED` audit log entry inside the same transaction.
 * The response returns plaintext clinical values from `input` directly, avoiding
 * a redundant decrypt round-trip for the just-written ciphertext.
 *
 * No `dataAccessLog` entry is written on create — no encrypted data is read back.
 */
export async function createMedicalRecord(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateMedicalRecordInput,
): Promise<MedicalRecordResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: input.athleteId },
      select: { id: true, name: true },
    });
    if (!athlete) throw new AthleteNotFoundError();

    if (input.protocolId) {
      const protocol = await tx.injuryProtocol.findUnique({
        where: { id: input.protocolId },
        select: { id: true },
      });
      if (!protocol) throw new ProtocolNotFoundError();
    }

    const clinicalNotes = input.clinicalNotes
      ? await encryptField(tx, input.clinicalNotes)
      : null;
    const diagnosis = input.diagnosis
      ? await encryptField(tx, input.diagnosis)
      : null;
    const treatmentDetails = input.treatmentDetails
      ? await encryptField(tx, input.treatmentDetails)
      : null;

    const record = await tx.medicalRecord.create({
      data: {
        athleteId: input.athleteId,
        protocolId: input.protocolId ?? null,
        occurredAt: new Date(input.occurredAt),
        structure: input.structure,
        grade: input.grade,
        mechanism: input.mechanism,
        clinicalNotes,
        diagnosis,
        treatmentDetails,
        createdBy: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEDICAL_RECORD_CREATED",
        entityId: record.id,
        entityType: "MedicalRecord",
        metadata: {
          athleteId: input.athleteId,
          structure: input.structure,
          grade: input.grade,
          mechanism: input.mechanism,
        },
      },
    });

    return {
      id: record.id,
      athleteId: record.athleteId,
      athleteName: athlete.name,
      protocolId: record.protocolId,
      occurredAt: record.occurredAt.toISOString().slice(0, 10),
      structure: record.structure,
      grade: record.grade,
      mechanism: record.mechanism,
      clinicalNotes: input.clinicalNotes ?? null,
      diagnosis: input.diagnosis ?? null,
      treatmentDetails: input.treatmentDetails ?? null,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
}

/**
 * Retrieves a single medical record by ID, decrypting all clinical fields.
 *
 * LGPD compliance — writes two audit entries on every successful read:
 *   1. `data_access_log` — actor, record id, which fields were decrypted,
 *      IP address and User-Agent for forensic traceability (Art. 37).
 *   2. `audit_log` — MEDICAL_RECORD_ACCESSED action for operational audit trail.
 *
 * Fields that are NULL in the database are not passed to pgcrypto and are
 * returned as null in the response.
 *
 * Throws `MedicalRecordNotFoundError` when no row exists in the tenant schema.
 */
export async function getMedicalRecordById(
  prisma: PrismaClient,
  clubId: string,
  recordId: string,
  actorId: string,
  requestMeta: RequestMeta = {},
): Promise<MedicalRecordResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const record = (await tx.medicalRecord.findUnique({
      where: { id: recordId },
      include: { athlete: { select: { name: true } } },
    })) as RawRecordRow | null;

    if (!record) throw new MedicalRecordNotFoundError();

    const fieldsRead: string[] = [];
    let clinicalNotes: string | null = null;
    let diagnosis: string | null = null;
    let treatmentDetails: string | null = null;

    if (record.clinicalNotes) {
      clinicalNotes = await decryptField(tx, record.clinicalNotes);
      fieldsRead.push("clinicalNotes");
    }
    if (record.diagnosis) {
      diagnosis = await decryptField(tx, record.diagnosis);
      fieldsRead.push("diagnosis");
    }
    if (record.treatmentDetails) {
      treatmentDetails = await decryptField(tx, record.treatmentDetails);
      fieldsRead.push("treatmentDetails");
    }

    await tx.dataAccessLog.create({
      data: {
        actorId,
        entityId: record.id,
        entityType: "MedicalRecord",
        action: DATA_ACCESS_ACTIONS.READ,
        fieldsRead,
        ipAddress: requestMeta.ipAddress ?? null,
        userAgent: requestMeta.userAgent ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEDICAL_RECORD_ACCESSED",
        entityId: record.id,
        entityType: "MedicalRecord",
        metadata: { athleteId: record.athleteId, fieldsRead },
      },
    });

    return {
      id: record.id,
      athleteId: record.athleteId,
      athleteName: record.athlete.name,
      protocolId: record.protocolId,
      occurredAt: record.occurredAt.toISOString().slice(0, 10),
      structure: record.structure,
      grade: record.grade,
      mechanism: record.mechanism,
      clinicalNotes,
      diagnosis,
      treatmentDetails,
      createdBy: record.createdBy,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
}

/**
 * Partially updates a medical record — any subset of fields may be changed.
 *
 * Clinical fields (`clinicalNotes`, `diagnosis`, `treatmentDetails`) are:
 *   - Re-encrypted if a non-null string is supplied.
 *   - Set to NULL if null is explicitly supplied (field cleared).
 *   - Left unchanged if the key is absent from `input` (undefined).
 *
 * `createdBy` is immutable and is never touched by this function.
 *
 * Decrypts the post-update state to return accurate plaintext values.
 * Uses `Promise.all` for parallel decryption of multiple fields.
 *
 * LGPD compliance: when clinical fields are decrypted for the response,
 * a `data_access_log` entry is written with action `UPDATE_READ`. This entry is
 * conditional — plaintext-only updates (structure, grade, etc.) do NOT generate
 * a data_access_log entry since no encrypted data is read.
 *
 * Throws `MedicalRecordNotFoundError` / `ProtocolNotFoundError` as appropriate.
 * Writes a `MEDICAL_RECORD_UPDATED` audit log entry.
 */
export async function updateMedicalRecord(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  recordId: string,
  input: UpdateMedicalRecordInput,
  requestMeta: RequestMeta = {},
): Promise<MedicalRecordResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = (await tx.medicalRecord.findUnique({
      where: { id: recordId },
      include: { athlete: { select: { name: true } } },
    })) as RawRecordRow | null;

    if (!existing) throw new MedicalRecordNotFoundError();

    if (input.protocolId !== undefined && input.protocolId !== null) {
      const protocol = await tx.injuryProtocol.findUnique({
        where: { id: input.protocolId },
        select: { id: true },
      });
      if (!protocol) throw new ProtocolNotFoundError();
    }

    const updateData: Record<string, unknown> = {};

    if (input.structure !== undefined)
      updateData["structure"] = input.structure;
    if (input.grade !== undefined) updateData["grade"] = input.grade;
    if (input.mechanism !== undefined)
      updateData["mechanism"] = input.mechanism;
    if (input.occurredAt !== undefined)
      updateData["occurredAt"] = new Date(input.occurredAt);
    if ("protocolId" in input) updateData["protocolId"] = input.protocolId;

    if (input.clinicalNotes !== undefined) {
      updateData["clinicalNotes"] = input.clinicalNotes
        ? await encryptField(tx, input.clinicalNotes)
        : null;
    }
    if (input.diagnosis !== undefined) {
      updateData["diagnosis"] = input.diagnosis
        ? await encryptField(tx, input.diagnosis)
        : null;
    }
    if (input.treatmentDetails !== undefined) {
      updateData["treatmentDetails"] = input.treatmentDetails
        ? await encryptField(tx, input.treatmentDetails)
        : null;
    }

    const updated = (await tx.medicalRecord.update({
      where: { id: recordId },
      data: updateData,
      include: { athlete: { select: { name: true } } },
    })) as RawRecordRow;

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEDICAL_RECORD_UPDATED",
        entityId: recordId,
        entityType: "MedicalRecord",
        metadata: { changes: Object.keys(updateData) },
      },
    });

    const [clinicalNotes, diagnosis, treatmentDetails] = await Promise.all([
      updated.clinicalNotes
        ? decryptField(tx, updated.clinicalNotes)
        : Promise.resolve(null),
      updated.diagnosis
        ? decryptField(tx, updated.diagnosis)
        : Promise.resolve(null),
      updated.treatmentDetails
        ? decryptField(tx, updated.treatmentDetails)
        : Promise.resolve(null),
    ]);

    const decryptedFields: string[] = [];
    if (updated.clinicalNotes) decryptedFields.push("clinicalNotes");
    if (updated.diagnosis) decryptedFields.push("diagnosis");
    if (updated.treatmentDetails) decryptedFields.push("treatmentDetails");

    if (decryptedFields.length > 0) {
      await tx.dataAccessLog.create({
        data: {
          actorId,
          entityId: recordId,
          entityType: "MedicalRecord",
          action: DATA_ACCESS_ACTIONS.UPDATE_READ,
          fieldsRead: decryptedFields,
          ipAddress: requestMeta.ipAddress ?? null,
          userAgent: requestMeta.userAgent ?? null,
        },
      });
    }

    return {
      id: updated.id,
      athleteId: updated.athleteId,
      athleteName: updated.athlete.name,
      protocolId: updated.protocolId,
      occurredAt: updated.occurredAt.toISOString().slice(0, 10),
      structure: updated.structure,
      grade: updated.grade,
      mechanism: updated.mechanism,
      clinicalNotes,
      diagnosis,
      treatmentDetails,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
}

/**
 * Permanently deletes a medical record (hard delete).
 *
 * No `deletedAt` column exists in the schema; deletion is tracked exclusively
 * via the `audit_log` entry with `metadata.deleted = true`. This mirrors the
 * `deleteEvaluation` pattern used throughout the codebase.
 *
 * LGPD compliance : writes a `data_access_log` entry with action
 * `DELETE_ACCESS` before the row is removed. The record is read for metadata
 * purposes only (no clinical field decryption), so `fieldsRead` is `[]`.
 * The log row intentionally has no FK to `medical_records` (the record is about
 * to be hard-deleted) — the schema already accommodates this via design.
 *
 * Throws `MedicalRecordNotFoundError` when the record does not exist.
 */
export async function deleteMedicalRecord(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  recordId: string,
  requestMeta: RequestMeta = {},
): Promise<void> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.medicalRecord.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        athleteId: true,
        structure: true,
        grade: true,
        occurredAt: true,
      },
    });

    if (!existing) throw new MedicalRecordNotFoundError();

    await tx.medicalRecord.delete({ where: { id: recordId } });

    await tx.dataAccessLog.create({
      data: {
        actorId,
        entityId: recordId,
        entityType: "MedicalRecord",
        action: DATA_ACCESS_ACTIONS.DELETE_ACCESS,
        fieldsRead: [],
        ipAddress: requestMeta.ipAddress ?? null,
        userAgent: requestMeta.userAgent ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEDICAL_RECORD_UPDATED",
        entityId: recordId,
        entityType: "MedicalRecord",
        metadata: {
          deleted: true,
          athleteId: existing.athleteId,
          structure: existing.structure,
          grade: existing.grade,
          occurredAt: existing.occurredAt.toISOString().slice(0, 10),
        },
      },
    });
  });
}

/**
 * Returns a paginated, optionally-filtered list of medical record summaries.
 *
 * Clinical fields are intentionally NOT decrypted in this function:
 *   - Avoids bulk pgcrypto round-trips for potentially hundreds of records.
 *   - Minimises LGPD exposure surface — `structure`, `grade`, and `mechanism`
 *     (stored as plaintext) are sufficient for timeline and dashboard views.
 *
 * LGPD compliance: even without field decryption, a list query is a
 * data processing operation under LGPD Art. 37. A single `data_access_log`
 * entry is written per call with action `LIST` and `fieldsRead = []`.
 * `entityId` is set to `"list"` — there is no FK constraint on this column,
 * and a per-row entry would be prohibitively expensive for large result sets.
 *
 * Supported filters:
 *   - `athleteId` — restrict to a single athlete
 *   - `grade`     — exact match on InjuryGrade enum value
 *   - `from / to` — occurredAt date range (inclusive both ends)
 *
 * Results are ordered newest-first (occurredAt DESC).
 */
export async function listMedicalRecords(
  prisma: PrismaClient,
  clubId: string,
  params: ListMedicalRecordsQuery,
  actorId: string,
  requestMeta: RequestMeta = {},
): Promise<PaginatedResponse<MedicalRecordSummary>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = {
      ...(params.athleteId ? { athleteId: params.athleteId } : {}),
      ...(params.grade ? { grade: params.grade } : {}),
      ...(params.from || params.to
        ? {
            occurredAt: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to
                ? { lte: new Date(`${params.to}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      tx.medicalRecord.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { occurredAt: "desc" },
        include: { athlete: { select: { name: true } } },
      }),
      tx.medicalRecord.count({ where }),
    ]);

    await tx.dataAccessLog.create({
      data: {
        actorId,
        entityId: "list",
        entityType: "MedicalRecord",
        action: DATA_ACCESS_ACTIONS.LIST,
        fieldsRead: [],
        ipAddress: requestMeta.ipAddress ?? null,
        userAgent: requestMeta.userAgent ?? null,
      },
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        athleteId: r.athleteId,
        athleteName: r.athlete.name,
        protocolId: r.protocolId,
        occurredAt: r.occurredAt.toISOString().slice(0, 10),
        structure: r.structure,
        grade: r.grade,
        mechanism: r.mechanism,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}
