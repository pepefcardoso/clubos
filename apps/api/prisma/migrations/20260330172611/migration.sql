-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'BALANCE_SHEET_PUBLISHED';
ALTER TYPE "AuditAction" ADD VALUE 'TEMPLATE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'TEMPLATE_RESET';

-- CreateTable
CREATE TABLE "balance_sheets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_sheets_publishedAt_idx" ON "balance_sheets"("publishedAt");
