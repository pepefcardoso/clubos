-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'EVALUATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EVALUATION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EVALUATION_DELETED';

-- CreateTable
CREATE TABLE "technical_evaluations" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "microcycle" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "technique" INTEGER NOT NULL,
    "tactical" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL,
    "mental" INTEGER NOT NULL,
    "attitude" INTEGER NOT NULL,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technical_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technical_evaluations_athleteId_idx" ON "technical_evaluations"("athleteId");

-- CreateIndex
CREATE INDEX "technical_evaluations_date_idx" ON "technical_evaluations"("date");

-- CreateIndex
CREATE UNIQUE INDEX "technical_evaluations_athleteId_microcycle_key" ON "technical_evaluations"("athleteId", "microcycle");

-- AddForeignKey
ALTER TABLE "technical_evaluations" ADD CONSTRAINT "technical_evaluations_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
