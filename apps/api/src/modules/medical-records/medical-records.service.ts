import { createHash } from "node:crypto";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import { encryptField, decryptField } from "../../lib/crypto.js";
import PDFDocument from "pdfkit";
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
  /** generateMedicalRecordReportPdf — full clinical decrypt for PDF export */
  EXPORT_PDF: "EXPORT_PDF",
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

interface LaudoPdfInput {
  clubName: string;
  athlete: { name: string; birthDate: Date; position: string | null };
  record: {
    id: string;
    occurredAt: Date;
    structure: string;
    grade: string;
    mechanism: string;
    createdAt: Date;
    athleteId: string;
  };
  protocol: {
    name: string;
    durationDays: number;
    steps: unknown;
  } | null;
  clinicalNotes: string | null;
  diagnosis: string | null;
  treatmentDetails: string | null;
  actorEmail: string;
  actorRole: string;
  generatedAt: Date;
  integrityHash: string;
}

/** Formats a Date to "DD/MM/YYYY" using UTC to avoid timezone shifts. */
function formatDatePt(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Formats a Date to "DD/MM/YYYY, HH:mm" using UTC. */
function formatDateTimePt(date: Date): string {
  return date.toLocaleString("pt-BR", { timeZone: "UTC" });
}

function gradeLabel(grade: string): string {
  const map: Record<string, string> = {
    GRADE_1: "Grau I — Leve (< 7 dias)",
    GRADE_2: "Grau II — Moderado (7–28 dias)",
    GRADE_3: "Grau III — Grave (> 28 dias)",
    COMPLETE: "Ruptura Completa — Avaliação cirúrgica",
  };
  return map[grade] ?? grade;
}

function mechanismLabel(mechanism: string): string {
  const map: Record<string, string> = {
    CONTACT: "Contato",
    NON_CONTACT: "Sem contato",
    OVERUSE: "Sobrecarga / overuse",
    UNKNOWN: "Não identificado",
  };
  return map[mechanism] ?? mechanism;
}

/**
 * Builds the PDF buffer for the insurance/health-plan injury report.
 *
 * Follows the PDFKit streaming pattern established in monthly-report.service.ts.
 * The PDF is generated entirely in memory — never written to disk.
 *
 * Sections:
 *   1. Header — club name, document title, generation timestamp
 *   2. Athlete Identification — name, date of birth, position
 *      NOTE: CPF and phone are intentionally excluded (LGPD minimisation)
 *   3. Injury Details — date, structure, grade, mechanism
 *   4. Clinical Data — diagnosis, clinical notes (only when present)
 *   5. Treatment Details (only when present)
 *   6. Return-to-Play Protocol — name, duration, steps (only when linked)
 *   7. Physiotherapist Attribution — actor email, role, generation timestamp
 *   8. Footer — integrity hash, record ID, LGPD notice
 */
function buildLaudoPdf(input: LaudoPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_WIDTH = 495;
    const HEADER_BG = "#1a5276";
    const SECTION_GAP = 0.8;

    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("LAUDO MÉDICO ESPORTIVO", { align: "center" });

    doc
      .fontSize(11)
      .font("Helvetica")
      .text(input.clubName, { align: "center" });

    doc
      .fontSize(9)
      .fillColor("#555555")
      .text(
        `Gerado em: ${formatDateTimePt(input.generatedAt)}   |   ID do Registro: ${input.record.id}`,
        { align: "center" },
      )
      .moveDown(1)
      .fillColor("#000000");

    doc
      .rect(50, doc.y, PAGE_WIDTH, 2)
      .fill(HEADER_BG)
      .fillColor("#000000")
      .moveDown(0.6);

    doc.fontSize(11).font("Helvetica-Bold").text("IDENTIFICAÇÃO DO ATLETA");
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .font("Helvetica")
      .text(`Nome: ${input.athlete.name}`)
      .text(`Data de Nascimento: ${formatDatePt(input.athlete.birthDate)}`)
      .text(`Posição: ${input.athlete.position ?? "Não informada"}`)
      .moveDown(SECTION_GAP);

    doc.fontSize(11).font("Helvetica-Bold").text("DADOS DA LESÃO");
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .font("Helvetica")
      .text(`Data da Ocorrência: ${formatDatePt(input.record.occurredAt)}`)
      .text(`Estrutura Anatômica: ${input.record.structure}`)
      .text(
        `Grau da Lesão (FIFA Medical 2023): ${gradeLabel(input.record.grade)}`,
      )
      .text(`Mecanismo: ${mechanismLabel(input.record.mechanism)}`)
      .moveDown(SECTION_GAP);

    if (input.diagnosis || input.clinicalNotes) {
      doc.fontSize(11).font("Helvetica-Bold").text("DADOS CLÍNICOS");
      doc.moveDown(0.3);

      if (input.diagnosis) {
        doc.fontSize(9).font("Helvetica-Bold").text("Diagnóstico:");
        doc
          .font("Helvetica")
          .text(input.diagnosis, { width: PAGE_WIDTH })
          .moveDown(0.4);
      }

      if (input.clinicalNotes) {
        doc.fontSize(9).font("Helvetica-Bold").text("Notas Clínicas:");
        doc
          .font("Helvetica")
          .text(input.clinicalNotes, { width: PAGE_WIDTH })
          .moveDown(0.4);
      }

      doc.moveDown(SECTION_GAP - 0.4);
    }

    if (input.treatmentDetails) {
      doc.fontSize(11).font("Helvetica-Bold").text("PROTOCOLO DE TRATAMENTO");
      doc.moveDown(0.3);
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(input.treatmentDetails, { width: PAGE_WIDTH })
        .moveDown(SECTION_GAP);
    }

    if (input.protocol) {
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text("PROTOCOLO DE RETORNO AO JOGO");
      doc.moveDown(0.3);
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(`Protocolo: ${input.protocol.name}`)
        .text(`Duração estimada: ${input.protocol.durationDays} dias`);

      const steps = input.protocol.steps as Array<{
        day: string;
        activity: string;
      }>;
      if (Array.isArray(steps) && steps.length > 0) {
        doc.moveDown(0.4);
        steps.forEach((step, i) => {
          doc.text(`  ${i + 1}. Dia(s) ${step.day}: ${step.activity}`, {
            width: PAGE_WIDTH - 20,
          });
        });
      }

      doc.moveDown(SECTION_GAP);
    }

    doc.fontSize(11).font("Helvetica-Bold").text("RESPONSÁVEL TÉCNICO");
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .font("Helvetica")
      .text(`Profissional: ${input.actorEmail}`)
      .text(
        `Função: ${input.actorRole === "PHYSIO" ? "Fisioterapeuta" : "Administrador"}`,
      )
      .text(`Data/hora de emissão: ${formatDateTimePt(input.generatedAt)}`)
      .moveDown(1);

    const sigY = doc.y;
    doc.moveTo(50, sigY).lineTo(280, sigY).strokeColor("#333333").stroke();
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#555555")
      .text("Assinatura do responsável técnico", 50, sigY + 4);
    doc.moveDown(2);

    doc
      .fontSize(7)
      .fillColor("#888888")
      .text(
        `Documento gerado automaticamente pelo ClubOS. ` +
          `Hash de integridade (SHA-256): ${input.integrityHash.substring(0, 16)}… ` +
          `| ID do registro: ${input.record.id}`,
        { align: "center", width: PAGE_WIDTH },
      )
      .moveDown(0.3)
      .text(
        "Este documento contém dados clínicos protegidos pela LGPD (Lei 13.709/2018). " +
          "Uso restrito ao destinatário autorizado.",
        { align: "center", width: PAGE_WIDTH },
      );

    doc.end();
  });
}

/**
 * Orchestrates the full PDF export pipeline for a single medical record:
 *
 *   1. Fetches the record (with athlete + protocol) from the tenant schema.
 *   2. Fetches the club name and actor email from the public schema
 *      (root `prisma`, NOT inside `withTenantSchema` — public schema tables).
 *   3. Decrypts clinical fields inside a tenant transaction (pgcrypto requires
 *      the correct search_path).
 *   4. Writes a `data_access_log` entry (action: EXPORT_PDF) and an
 *      `audit_log` entry (MEDICAL_RECORD_ACCESSED) for LGPD Art. 37.
 *   5. Computes a SHA-256 integrity hash over immutable record fields,
 *      suitable for insurance submission tamper-evidence.
 *   6. Builds and returns the PDF buffer via PDFKit.
 *
 * @param prisma      Singleton Prisma client (not a transaction).
 * @param clubId      Tenant identifier.
 * @param recordId    Medical record ID within the tenant schema.
 * @param actorId     ID of the authenticated user requesting the export.
 * @param requestMeta HTTP request metadata for the audit log.
 */
export async function generateMedicalRecordReportPdf(
  prisma: PrismaClient,
  clubId: string,
  recordId: string,
  actorId: string,
  requestMeta: RequestMeta = {},
): Promise<Buffer> {
  type TenantRecord = {
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
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    athlete: { name: string; birthDate: Date; position: string | null };
    protocol: {
      id: string;
      name: string;
      durationDays: number;
      steps: unknown;
    } | null;
  };

  const record = await withTenantSchema(
    prisma,
    clubId,
    async (tx): Promise<TenantRecord> => {
      const row = (await tx.medicalRecord.findUnique({
        where: { id: recordId },
        include: {
          athlete: {
            select: { name: true, birthDate: true, position: true },
          },
          protocol: {
            select: {
              id: true,
              name: true,
              durationDays: true,
              steps: true,
            },
          },
        },
      })) as TenantRecord | null;

      if (!row) throw new MedicalRecordNotFoundError();
      return row;
    },
  );

  const [club, actor] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true, role: true },
    }),
  ]);

  const [clinicalNotes, diagnosis, treatmentDetails] = await withTenantSchema(
    prisma,
    clubId,
    async (tx): Promise<[string | null, string | null, string | null]> =>
      Promise.all([
        record.clinicalNotes
          ? decryptField(tx, record.clinicalNotes)
          : Promise.resolve(null),
        record.diagnosis
          ? decryptField(tx, record.diagnosis)
          : Promise.resolve(null),
        record.treatmentDetails
          ? decryptField(tx, record.treatmentDetails)
          : Promise.resolve(null),
      ]),
  );

  const fieldsRead: string[] = [];
  if (record.clinicalNotes) fieldsRead.push("clinicalNotes");
  if (record.diagnosis) fieldsRead.push("diagnosis");
  if (record.treatmentDetails) fieldsRead.push("treatmentDetails");

  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.dataAccessLog.create({
      data: {
        actorId,
        entityId: recordId,
        entityType: "MedicalRecord",
        action: DATA_ACCESS_ACTIONS.EXPORT_PDF,
        fieldsRead,
        ipAddress: requestMeta.ipAddress ?? null,
        userAgent: requestMeta.userAgent ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEDICAL_RECORD_ACCESSED",
        entityId: recordId,
        entityType: "MedicalRecord",
        metadata: { fieldsRead, exportFormat: "pdf" },
      },
    });
  });

  const integrityHash = createHash("sha256")
    .update(
      [
        record.athleteId,
        record.occurredAt.toISOString(),
        record.structure,
        record.grade,
        record.createdAt.toISOString(),
      ].join("|"),
    )
    .digest("hex");

  return buildLaudoPdf({
    clubName: club?.name ?? "Clube",
    athlete: record.athlete,
    record: {
      id: record.id,
      occurredAt: record.occurredAt,
      structure: record.structure,
      grade: record.grade,
      mechanism: record.mechanism,
      createdAt: record.createdAt,
      athleteId: record.athleteId,
    },
    protocol: record.protocol ?? null,
    clinicalNotes,
    diagnosis,
    treatmentDetails,
    actorEmail: actor?.email ?? actorId,
    actorRole: actor?.role ?? "PHYSIO",
    generatedAt: new Date(),
    integrityHash,
  });
}
