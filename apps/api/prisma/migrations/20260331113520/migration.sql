-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('STRENGTH', 'CARDIO', 'TECHNICAL', 'TACTICAL', 'RECOVERY', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'EXERCISE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXERCISE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXERCISE_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'TRAINING_SESSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TRAINING_SESSION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'TRAINING_SESSION_DELETED';

-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ExerciseCategory" NOT NULL DEFAULT 'OTHER',
    "muscleGroups" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sessionType" "SessionType" NOT NULL DEFAULT 'TRAINING',
    "durationMinutes" INTEGER NOT NULL,
    "notes" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_exercises" (
    "id" TEXT NOT NULL,
    "trainingSessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "sets" INTEGER,
    "reps" INTEGER,
    "durationSeconds" INTEGER,
    "notes" TEXT,

    CONSTRAINT "session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercises_category_idx" ON "exercises"("category");

-- CreateIndex
CREATE INDEX "exercises_isActive_idx" ON "exercises"("isActive");

-- CreateIndex
CREATE INDEX "training_sessions_scheduledAt_idx" ON "training_sessions"("scheduledAt");

-- CreateIndex
CREATE INDEX "training_sessions_sessionType_idx" ON "training_sessions"("sessionType");

-- CreateIndex
CREATE INDEX "training_sessions_isCompleted_idx" ON "training_sessions"("isCompleted");

-- CreateIndex
CREATE INDEX "session_exercises_trainingSessionId_idx" ON "session_exercises"("trainingSessionId");

-- CreateIndex
CREATE INDEX "session_exercises_exerciseId_idx" ON "session_exercises"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "session_exercises_trainingSessionId_exerciseId_key" ON "session_exercises"("trainingSessionId", "exerciseId");

-- AddForeignKey
ALTER TABLE "workload_metrics" ADD CONSTRAINT "workload_metrics_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_trainingSessionId_fkey" FOREIGN KEY ("trainingSessionId") REFERENCES "training_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
