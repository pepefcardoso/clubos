-- CreateTable
CREATE TABLE "integration_tokens" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_tokens_athleteId_idx" ON "integration_tokens"("athleteId");

-- CreateIndex
CREATE INDEX "integration_tokens_isActive_idx" ON "integration_tokens"("isActive");

-- AddForeignKey
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
