import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { encryptField, decryptField } from "../../lib/crypto.js";
import { validatePhysioClubSwitch } from "../physio/physio.service.js";
import { findAthleteByCpf } from "../../lib/crypto.js";
import type { RequestMeta } from "./medical-records.service.js";

export class TransferTargetAthleteNotFoundError extends NotFoundError {
  constructor() {
    super(
      "Atleta não encontrado no clube de destino. " +
        "O atleta deve ser cadastrado no clube-destino pelo ADMIN antes da transferência.",
    );
    this.name = "TransferTargetAthleteNotFoundError";
  }
}

interface TransferMedicalRecordResult {
  newRecordId: string;
}

type RawTransferRecord = {
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
  athlete: { cpf: Uint8Array };
};

/**
 * Transfers a medical record from the source club (actorId's current clubId)
 * to a target club the same PHYSIO also has access to.
 *
 * Steps:
 *   1. Assert PHYSIO has active access to targetClubId.
 *   2. Read the source record and decrypt all clinical fields (source tenant schema).
 *   3. Resolve the athlete in the target club via CPF lookup (findAthleteByCpf).
 *      The athlete must already exist in the target club — no auto-creation.
 *   4. Re-encrypt clinical fields in the target tenant schema context.
 *   5. INSERT the record into the target club's medical_records table.
 *   6. Write MEDICAL_RECORD_TRANSFER_OUT in source audit_log.
 *   7. Write MEDICAL_RECORD_TRANSFER_IN in target audit_log.
 *   8. Write data_access_log entries in both schemas (LGPD Art. 37).
 *
 * @param prisma         Singleton Prisma client (not a transaction).
 * @param sourceClubId   Club owning the original record (from JWT).
 * @param targetClubId   Destination club.
 * @param recordId       Source medical record ID.
 * @param actorId        Authenticated PHYSIO user ID.
 * @param consentNotes   Required justification text (min 10 chars).
 * @param requestMeta    HTTP metadata for LGPD audit.
 */
export async function transferMedicalRecord(
  prisma: PrismaClient,
  sourceClubId: string,
  targetClubId: string,
  recordId: string,
  actorId: string,
  consentNotes: string,
  requestMeta: RequestMeta = {},
): Promise<TransferMedicalRecordResult> {
  if (sourceClubId === targetClubId) {
    throw new ForbiddenError("Origem e destino são o mesmo clube.");
  }

  await validatePhysioClubSwitch(prisma, actorId, targetClubId);

  type DecryptedRecord = {
    id: string;
    athleteId: string;
    protocolId: string | null;
    occurredAt: Date;
    structure: string;
    grade: string;
    mechanism: string;
    clinicalNotes: string | null;
    diagnosis: string | null;
    treatmentDetails: string | null;
    createdBy: string;
    athleteCpf: Uint8Array;
  };

  const decryptedRecord = await withTenantSchema(
    prisma,
    sourceClubId,
    async (tx): Promise<DecryptedRecord> => {
      const row = (await tx.medicalRecord.findUnique({
        where: { id: recordId },
        include: {
          athlete: { select: { cpf: true } },
        },
      })) as RawTransferRecord | null;

      if (!row) {
        throw new NotFoundError("Prontuário não encontrado.");
      }

      const [clinicalNotes, diagnosis, treatmentDetails] = await Promise.all([
        row.clinicalNotes
          ? decryptField(tx, row.clinicalNotes)
          : Promise.resolve(null),
        row.diagnosis ? decryptField(tx, row.diagnosis) : Promise.resolve(null),
        row.treatmentDetails
          ? decryptField(tx, row.treatmentDetails)
          : Promise.resolve(null),
      ]);

      const fieldsRead: string[] = [];
      if (row.clinicalNotes) fieldsRead.push("clinicalNotes");
      if (row.diagnosis) fieldsRead.push("diagnosis");
      if (row.treatmentDetails) fieldsRead.push("treatmentDetails");

      await tx.dataAccessLog.create({
        data: {
          actorId,
          entityId: recordId,
          entityType: "MedicalRecord",
          action: "TRANSFER_READ",
          fieldsRead,
          ipAddress: requestMeta.ipAddress ?? null,
          userAgent: requestMeta.userAgent ?? null,
        },
      });

      return {
        id: row.id,
        athleteId: row.athleteId,
        protocolId: row.protocolId,
        occurredAt: row.occurredAt,
        structure: row.structure,
        grade: row.grade,
        mechanism: row.mechanism,
        clinicalNotes,
        diagnosis,
        treatmentDetails,
        createdBy: row.createdBy,
        athleteCpf: row.athlete.cpf,
      };
    },
  );

  const plaintextCpf = await withTenantSchema(
    prisma,
    sourceClubId,
    async (tx) => decryptField(tx, decryptedRecord.athleteCpf),
  );

  const targetAthleteId = await withTenantSchema(
    prisma,
    targetClubId,
    async (tx) => {
      const match = await findAthleteByCpf(tx, plaintextCpf);
      if (!match) throw new TransferTargetAthleteNotFoundError();
      return match.id;
    },
  );

  const newRecordId = await withTenantSchema(
    prisma,
    targetClubId,
    async (tx) => {
      const [encClinicalNotes, encDiagnosis, encTreatmentDetails] =
        await Promise.all([
          decryptedRecord.clinicalNotes
            ? encryptField(tx, decryptedRecord.clinicalNotes)
            : Promise.resolve(null),
          decryptedRecord.diagnosis
            ? encryptField(tx, decryptedRecord.diagnosis)
            : Promise.resolve(null),
          decryptedRecord.treatmentDetails
            ? encryptField(tx, decryptedRecord.treatmentDetails)
            : Promise.resolve(null),
        ]);

      const created = await tx.medicalRecord.create({
        data: {
          athleteId: targetAthleteId,
          protocolId: null,
          occurredAt: decryptedRecord.occurredAt,
          structure: decryptedRecord.structure,
          grade: decryptedRecord.grade as never,
          mechanism: decryptedRecord.mechanism as never,
          clinicalNotes: encClinicalNotes,
          diagnosis: encDiagnosis,
          treatmentDetails: encTreatmentDetails,
          createdBy: actorId,
        },
        select: { id: true },
      });

      const fieldsWritten: string[] = [];
      if (encClinicalNotes) fieldsWritten.push("clinicalNotes");
      if (encDiagnosis) fieldsWritten.push("diagnosis");
      if (encTreatmentDetails) fieldsWritten.push("treatmentDetails");

      await tx.dataAccessLog.create({
        data: {
          actorId,
          entityId: created.id,
          entityType: "MedicalRecord",
          action: "TRANSFER_WRITE",
          fieldsRead: fieldsWritten,
          ipAddress: requestMeta.ipAddress ?? null,
          userAgent: requestMeta.userAgent ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "MEDICAL_RECORD_CREATED",
          entityId: created.id,
          entityType: "MedicalRecord",
          metadata: {
            transferredFrom: sourceClubId,
            originalRecordId: recordId,
            consentNotes,
            athleteId: targetAthleteId,
            structure: decryptedRecord.structure,
            grade: decryptedRecord.grade,
          },
        },
      });

      return created.id;
    },
  );

  await withTenantSchema(prisma, sourceClubId, async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId,
        action: "MEDICAL_RECORD_UPDATED",
        entityId: recordId,
        entityType: "MedicalRecord",
        metadata: {
          transferredTo: targetClubId,
          newRecordId,
          consentNotes,
          athleteId: decryptedRecord.athleteId,
        },
      },
    });
  });

  return { newRecordId };
}
