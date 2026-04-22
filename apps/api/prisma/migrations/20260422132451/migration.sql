-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECORD_TRANSFER_OUT';
ALTER TYPE "AuditAction" ADD VALUE 'MEDICAL_RECORD_TRANSFER_IN';

-- CreateTable
CREATE TABLE "physio_club_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT NOT NULL,

    CONSTRAINT "physio_club_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "physio_club_access_userId_idx" ON "physio_club_access"("userId");

-- CreateIndex
CREATE INDEX "physio_club_access_clubId_idx" ON "physio_club_access"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "physio_club_access_userId_clubId_key" ON "physio_club_access"("userId", "clubId");

-- AddForeignKey
ALTER TABLE "physio_club_access" ADD CONSTRAINT "physio_club_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physio_club_access" ADD CONSTRAINT "physio_club_access_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
