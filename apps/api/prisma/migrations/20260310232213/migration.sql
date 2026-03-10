-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('PROFESSIONAL', 'AMATEUR', 'FORMATIVE', 'LOAN');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CONTRACT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTRACT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CONTRACT_TERMINATED';

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "bidRegistered" BOOLEAN NOT NULL DEFAULT false,
    "federationCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_athleteId_idx" ON "contracts"("athleteId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_endDate_idx" ON "contracts"("endDate");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
