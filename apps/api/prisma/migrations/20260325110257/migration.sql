-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('MATCH', 'TRAINING', 'GYM', 'RECOVERY', 'OTHER');

-- CreateTable
CREATE TABLE "workload_metrics" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "trainingSessionId" TEXT,
    "date" DATE NOT NULL,
    "rpe" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "sessionType" "SessionType" NOT NULL DEFAULT 'TRAINING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workload_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workload_metrics_athleteId_idx" ON "workload_metrics"("athleteId");

-- CreateIndex
CREATE INDEX "workload_metrics_date_idx" ON "workload_metrics"("date");

-- AddForeignKey
ALTER TABLE "workload_metrics" ADD CONSTRAINT "workload_metrics_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
