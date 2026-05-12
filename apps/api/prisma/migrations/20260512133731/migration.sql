-- CreateEnum
CREATE TYPE "ShowcaseTier" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScoutSubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "scout_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "subscriptionStatus" "ScoutSubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "subscriptionExpiresAt" TIMESTAMP(3),
    "specialization" TEXT,
    "targetPositions" TEXT[],
    "targetAgeRanges" TEXT[],
    "crmNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scout_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scout_showcases" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "tier" "ShowcaseTier" NOT NULL DEFAULT 'FREE',
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scout_showcases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase_videos" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "showcase_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" "ContactRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parental_consents" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL,
    "guardianCpf" BYTEA NOT NULL,
    "consentHash" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parental_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scout_profiles_email_key" ON "scout_profiles"("email");

-- CreateIndex
CREATE INDEX "scout_profiles_email_idx" ON "scout_profiles"("email");

-- CreateIndex
CREATE INDEX "scout_showcases_athleteId_idx" ON "scout_showcases"("athleteId");

-- CreateIndex
CREATE INDEX "scout_showcases_tier_idx" ON "scout_showcases"("tier");

-- CreateIndex
CREATE INDEX "scout_showcases_isPublished_idx" ON "scout_showcases"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "scout_showcases_clubId_athleteId_key" ON "scout_showcases"("clubId", "athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "showcase_videos_r2Key_key" ON "showcase_videos"("r2Key");

-- CreateIndex
CREATE INDEX "showcase_videos_athleteId_clubId_idx" ON "showcase_videos"("athleteId", "clubId");

-- CreateIndex
CREATE INDEX "contact_requests_scoutId_athleteId_idx" ON "contact_requests"("scoutId", "athleteId");

-- CreateIndex
CREATE INDEX "contact_requests_clubId_idx" ON "contact_requests"("clubId");

-- CreateIndex
CREATE INDEX "contact_requests_status_idx" ON "contact_requests"("status");

-- CreateIndex
CREATE INDEX "communication_log_actorId_idx" ON "communication_log"("actorId");

-- CreateIndex
CREATE INDEX "communication_log_targetId_idx" ON "communication_log"("targetId");

-- CreateIndex
CREATE INDEX "parental_consents_athleteId_clubId_idx" ON "parental_consents"("athleteId", "clubId");

-- AddForeignKey
ALTER TABLE "scout_showcases" ADD CONSTRAINT "scout_showcases_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showcase_videos" ADD CONSTRAINT "showcase_videos_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "scout_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parental_consents" ADD CONSTRAINT "parental_consents_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
