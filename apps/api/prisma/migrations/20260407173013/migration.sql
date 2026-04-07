-- CreateEnum
CREATE TYPE "RtpStatus" AS ENUM ('AFASTADO', 'RETORNO_PROGRESSIVO', 'LIBERADO');

-- CreateEnum
CREATE TYPE "InjuryGrade" AS ENUM ('GRADE_1', 'GRADE_2', 'GRADE_3', 'COMPLETE');

-- CreateEnum
CREATE TYPE "InjuryMechanism" AS ENUM ('CONTACT', 'NON_CONTACT', 'OVERUSE', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECORD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECORD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECORD_ACCESSED';
ALTER TYPE "AuditAction" ADD VALUE 'RTP_STATUS_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CREDITOR_DISCLOSURE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CREDITOR_DISCLOSURE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'FIELD_ACCESS_LOGGED';

-- CreateTable
CREATE TABLE "injury_protocols" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "grade" "InjuryGrade" NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "durationDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "injury_protocols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "protocolId" TEXT,
    "occurredAt" DATE NOT NULL,
    "structure" TEXT NOT NULL,
    "grade" "InjuryGrade" NOT NULL,
    "mechanism" "InjuryMechanism" NOT NULL DEFAULT 'UNKNOWN',
    "clinicalNotes" BYTEA,
    "diagnosis" BYTEA,
    "treatmentDetails" BYTEA,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_to_play" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" "RtpStatus" NOT NULL DEFAULT 'AFASTADO',
    "medicalRecordId" TEXT,
    "protocolId" TEXT,
    "clearedAt" TIMESTAMP(3),
    "clearedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_to_play_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_access_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'MedicalRecord',
    "action" TEXT NOT NULL,
    "fieldsRead" TEXT[],
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_access_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creditor_disclosures" (
    "id" TEXT NOT NULL,
    "creditorName" TEXT NOT NULL,
    "description" TEXT,
    "amountCents" INTEGER NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "registeredBy" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creditor_disclosures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_access_logs" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "scannedBy" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL,
    "rejectionReason" TEXT,
    "idempotencyKey" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "injury_protocols_structure_idx" ON "injury_protocols"("structure");

-- CreateIndex
CREATE INDEX "injury_protocols_isActive_idx" ON "injury_protocols"("isActive");

-- CreateIndex
CREATE INDEX "medical_records_athleteId_idx" ON "medical_records"("athleteId");

-- CreateIndex
CREATE INDEX "medical_records_occurredAt_idx" ON "medical_records"("occurredAt");

-- CreateIndex
CREATE INDEX "medical_records_grade_idx" ON "medical_records"("grade");

-- CreateIndex
CREATE UNIQUE INDEX "return_to_play_athleteId_key" ON "return_to_play"("athleteId");

-- CreateIndex
CREATE INDEX "return_to_play_status_idx" ON "return_to_play"("status");

-- CreateIndex
CREATE INDEX "data_access_log_actorId_idx" ON "data_access_log"("actorId");

-- CreateIndex
CREATE INDEX "data_access_log_entityId_idx" ON "data_access_log"("entityId");

-- CreateIndex
CREATE INDEX "creditor_disclosures_dueDate_idx" ON "creditor_disclosures"("dueDate");

-- CreateIndex
CREATE INDEX "creditor_disclosures_status_idx" ON "creditor_disclosures"("status");

-- CreateIndex
CREATE UNIQUE INDEX "field_access_logs_idempotencyKey_key" ON "field_access_logs"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "injury_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_to_play" ADD CONSTRAINT "return_to_play_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_to_play" ADD CONSTRAINT "return_to_play_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_to_play" ADD CONSTRAINT "return_to_play_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "injury_protocols"("id") ON DELETE SET NULL ON UPDATE CASCADE;
