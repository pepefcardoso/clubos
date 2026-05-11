// apps/api/src/lib/provision-public-schema.ts

import type { PrismaClient } from "../../generated/prisma/index.js";

// ---------------------------------------------------------------------------
// DDL — public schema ScoutLink tables
//
// Execution strategy mirrors tenant-schema.ts:
//   Step 1 (outside tx): enum types — DO/EXCEPTION blocks.
//   Step 2 (inside tx):  tables + indexes + FKs + trigger function + triggers.
//
// All statements are idempotent (IF NOT EXISTS / DO-EXCEPTION / CREATE OR REPLACE).
// DDL is the source of truth — schema.prisma carries these models for TypeScript
// type generation only, not for migration management.
// ---------------------------------------------------------------------------

const PUBLIC_ENUMS_DDL = `
  DO $$ BEGIN
    CREATE TYPE "ShowcaseTier" AS ENUM ('FREE', 'PREMIUM');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "ContactRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "ScoutSubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

const PUBLIC_TABLES_DDL = `
  CREATE TABLE IF NOT EXISTS "scout_profiles" (
    "id"                    TEXT                      NOT NULL,
    "name"                  TEXT                      NOT NULL,
    "email"                 TEXT                      NOT NULL,
    "password"              TEXT                      NOT NULL,
    "subscriptionStatus"    "ScoutSubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "subscriptionExpiresAt" TIMESTAMP(3),
    "specialization"        TEXT,
    "targetPositions"       TEXT[]                    NOT NULL DEFAULT '{}',
    "targetAgeRanges"       TEXT[]                    NOT NULL DEFAULT '{}',
    "crmNumber"             TEXT,
    "createdAt"             TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3)              NOT NULL,
    CONSTRAINT "scout_profiles_pkey" PRIMARY KEY ("id")
  );

  -- athleteId references clube_{clubId}.athletes — cross-schema FK FORBIDDEN. [SEC-TEN]
  -- snapshot JSONB must never contain clinicalNotes, diagnosis, treatmentDetails. [SEC]
  CREATE TABLE IF NOT EXISTS "scout_showcases" (
    "id"            TEXT           NOT NULL,
    "clubId"        TEXT           NOT NULL,
    "athleteId"     TEXT           NOT NULL,
    "tier"          "ShowcaseTier" NOT NULL DEFAULT 'FREE',
    "snapshot"      JSONB          NOT NULL,
    "snapshotHash"  TEXT           NOT NULL,
    "isPublished"   BOOLEAN        NOT NULL DEFAULT false,
    "publishedAt"   TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "scout_showcases_pkey" PRIMARY KEY ("id")
  );

  -- r2Key = Cloudflare R2 object key (randomUUID — never original filename). [SEC-FILE]
  -- Max 5 videos per athlete enforced at app layer (T-166).
  CREATE TABLE IF NOT EXISTS "showcase_videos" (
    "id"              TEXT         NOT NULL,
    "athleteId"       TEXT         NOT NULL,
    "clubId"          TEXT         NOT NULL,
    "r2Key"           TEXT         NOT NULL,
    "durationSeconds" INTEGER      NOT NULL,
    "thumbnailUrl"    TEXT,
    "order"           INTEGER      NOT NULL DEFAULT 0,
    "uploadedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "showcase_videos_pkey" PRIMARY KEY ("id")
  );

  -- 30-day dedup (scoutId + athleteId) enforced at app layer only — no UNIQUE constraint
  -- because the constraint would block re-request after the dedup window closes. [T-172]
  CREATE TABLE IF NOT EXISTS "contact_requests" (
    "id"        TEXT                   NOT NULL,
    "scoutId"   TEXT                   NOT NULL,
    "clubId"    TEXT                   NOT NULL,
    "athleteId" TEXT                   NOT NULL,
    "status"    "ContactRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason"    TEXT,
    "createdAt" TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)           NOT NULL,
    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
  );

  -- Append-only — mutation blocked by prevent_immutable_table_mutation trigger.
  -- metadata JSONB must never contain CPF, phone, or email (Zod enforcement in T-174).
  CREATE TABLE IF NOT EXISTS "communication_log" (
    "id"        TEXT         NOT NULL,
    "actorId"   TEXT         NOT NULL,
    "actorRole" TEXT         NOT NULL,
    "targetId"  TEXT         NOT NULL,
    "eventType" TEXT         NOT NULL,
    "metadata"  JSONB,
    "ip"        TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "communication_log_pkey" PRIMARY KEY ("id")
  );

  -- Immutable after INSERT — mutation blocked by prevent_immutable_table_mutation trigger.
  -- guardianCpf stored as BYTEA via pgp_sym_encrypt (MEMBER_ENCRYPTION_KEY). [SEC]
  CREATE TABLE IF NOT EXISTS "parental_consents" (
    "id"           TEXT         NOT NULL,
    "athleteId"    TEXT         NOT NULL,
    "clubId"       TEXT         NOT NULL,
    "guardianName" TEXT         NOT NULL,
    "guardianCpf"  BYTEA        NOT NULL,
    "consentHash"  TEXT         NOT NULL,
    "ip"           TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parental_consents_pkey" PRIMARY KEY ("id")
  );
`;

const PUBLIC_INDEXES_DDL = `
  CREATE UNIQUE INDEX IF NOT EXISTS "scout_profiles_email_key"
    ON "scout_profiles" ("email");

  -- UNIQUE enforces one showcase per athlete per club (T-165 idempotency invariant).
  CREATE UNIQUE INDEX IF NOT EXISTS "scout_showcases_clubId_athleteId_key"
    ON "scout_showcases" ("clubId", "athleteId");
  CREATE INDEX IF NOT EXISTS "scout_showcases_athleteId_idx"
    ON "scout_showcases" ("athleteId");
  CREATE INDEX IF NOT EXISTS "scout_showcases_tier_idx"
    ON "scout_showcases" ("tier");
  CREATE INDEX IF NOT EXISTS "scout_showcases_isPublished_idx"
    ON "scout_showcases" ("isPublished");

  CREATE UNIQUE INDEX IF NOT EXISTS "showcase_videos_r2Key_key"
    ON "showcase_videos" ("r2Key");
  CREATE INDEX IF NOT EXISTS "showcase_videos_athleteId_clubId_idx"
    ON "showcase_videos" ("athleteId", "clubId");

  CREATE INDEX IF NOT EXISTS "contact_requests_scoutId_idx"
    ON "contact_requests" ("scoutId");
  CREATE INDEX IF NOT EXISTS "contact_requests_clubId_idx"
    ON "contact_requests" ("clubId");
  CREATE INDEX IF NOT EXISTS "contact_requests_scoutId_athleteId_idx"
    ON "contact_requests" ("scoutId", "athleteId");
  CREATE INDEX IF NOT EXISTS "contact_requests_status_idx"
    ON "contact_requests" ("status");

  -- BRIN: communication_log is high-volume, append-only.
  CREATE INDEX IF NOT EXISTS "communication_log_actorId_idx"
    ON "communication_log" ("actorId");
  CREATE INDEX IF NOT EXISTS "communication_log_targetId_idx"
    ON "communication_log" ("targetId");
  CREATE INDEX IF NOT EXISTS "communication_log_createdAt_brin_idx"
    ON "communication_log" USING BRIN ("createdAt");

  CREATE INDEX IF NOT EXISTS "parental_consents_athleteId_clubId_idx"
    ON "parental_consents" ("athleteId", "clubId");
`;

const PUBLIC_FOREIGN_KEYS_DDL = `
  ALTER TABLE "scout_showcases"
    ADD CONSTRAINT IF NOT EXISTS "scout_showcases_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "clubs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  ALTER TABLE "showcase_videos"
    ADD CONSTRAINT IF NOT EXISTS "showcase_videos_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "clubs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  ALTER TABLE "contact_requests"
    ADD CONSTRAINT IF NOT EXISTS "contact_requests_scoutId_fkey"
    FOREIGN KEY ("scoutId") REFERENCES "scout_profiles" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  ALTER TABLE "contact_requests"
    ADD CONSTRAINT IF NOT EXISTS "contact_requests_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "clubs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  ALTER TABLE "parental_consents"
    ADD CONSTRAINT IF NOT EXISTS "parental_consents_clubId_fkey"
    FOREIGN KEY ("clubId") REFERENCES "clubs" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- No FK from any ScoutLink table to clube_{id}.athletes — cross-schema FKs FORBIDDEN. [SEC-TEN]
  -- Composite (clubId, athleteId) referential integrity enforced at app layer only.
`;

// CREATE OR REPLACE FUNCTION is idempotent.
// Trigger CREATE uses DO/EXCEPTION — same pattern as tenant-schema.ts.
// Single shared function handles both immutable tables.
const PUBLIC_TRIGGERS_DDL = `
  CREATE OR REPLACE FUNCTION prevent_immutable_table_mutation()
  RETURNS TRIGGER AS $$
  BEGIN
    RAISE EXCEPTION
      'Rows in "%" are immutable — UPDATE and DELETE are not permitted', TG_TABLE_NAME;
  END;
  $$ LANGUAGE plpgsql;

  DO $$ BEGIN
    CREATE TRIGGER communication_log_immutability
      BEFORE UPDATE OR DELETE ON "communication_log"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_immutable_table_mutation();
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TRIGGER parental_consents_immutability
      BEFORE UPDATE OR DELETE ON "parental_consents"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_immutable_table_mutation();
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`;

/**
 * Provisions all public-schema ScoutLink tables idempotently.
 *
 * Called at every application startup (buildApp(), after registerWhatsAppProvider(),
 * before registerJobs()). Safe to call multiple times.
 *
 * Execution order:
 *   Step 1 (outside tx): enum types — DO/EXCEPTION blocks must run outside a transaction
 *                        to avoid "cannot CREATE TYPE inside a transaction" on some PG versions.
 *   Step 2 (inside tx):  tables, indexes, FKs, trigger function, triggers — atomic.
 */
export async function provisionPublicSchema(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe(PUBLIC_ENUMS_DDL);

  await prisma.$transaction(async (tx) => {
    const client = tx as unknown as PrismaClient;
    await client.$executeRawUnsafe(PUBLIC_TABLES_DDL);
    await client.$executeRawUnsafe(PUBLIC_INDEXES_DDL);
    await client.$executeRawUnsafe(PUBLIC_FOREIGN_KEYS_DDL);
    await client.$executeRawUnsafe(PUBLIC_TRIGGERS_DDL);
  });
}
