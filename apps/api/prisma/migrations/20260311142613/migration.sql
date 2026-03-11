-- CreateTable
CREATE TABLE "rules_config" (
    "id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rules_config_isActive_idx" ON "rules_config"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "rules_config_season_league_key" ON "rules_config"("season", "league");
