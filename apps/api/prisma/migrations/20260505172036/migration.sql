-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'TICKET_CANCELLED';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "gatewayMeta" JSONB,
ADD COLUMN     "gatewayName" TEXT;
