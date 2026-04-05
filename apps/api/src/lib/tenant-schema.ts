import type { Prisma, PrismaClient } from "../../generated/prisma/index.js";

/**
 * Validates that a clubId is a safe cuid2-like value before interpolating it
 * into a PostgreSQL schema identifier.
 *
 * cuid2 values are lowercase alphanumeric, typically 24 characters.
 * This guard prevents SQL injection via the schema name even if a malformed
 * value somehow reaches this function.
 */
function assertValidClubId(clubId: string): void {
  if (!/^[a-z0-9]{20,30}$/.test(clubId)) {
    throw new Error(
      `Invalid clubId format: "${clubId}". ` +
        `Expected a lowercase alphanumeric cuid2 value (20–30 chars).`,
    );
  }
}

// ---------------------------------------------------------------------------
// DDL constants
// ---------------------------------------------------------------------------
// Each block is idempotent and can be re-run safely against an existing schema.
// All blocks are applied after SET search_path to the tenant schema, except
// PGCRYPTO_DDL which is always applied in the public schema.
// ---------------------------------------------------------------------------

/**
 * Ensures the pgcrypto extension is available.
 * Runs in the PUBLIC schema (before setting tenant search_path).
 * Required for pgp_sym_encrypt / pgp_sym_decrypt used by cpf and phone fields.
 */
const PGCRYPTO_DDL = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
`;

/**
 * All enum types used by tenant tables.
 *
 * PostgreSQL enums are database-level objects, not schema-scoped.
 * The DO/EXCEPTION block is the standard idempotent pattern since
 * CREATE TYPE does not support IF NOT EXISTS before PG 14.
 *
 * IMPORTANT: ALTER TYPE ... ADD VALUE IF NOT EXISTS cannot be executed inside
 * an open transaction block (PostgreSQL restriction). These statements are
 * therefore applied OUTSIDE the transaction in provisionTenantSchema — see
 * the execution order comments there.
 */
const TENANT_ENUMS_DDL = `
  DO $$ BEGIN
    CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'OVERDUE');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "PlanInterval" AS ENUM ('monthly', 'quarterly', 'annual');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "PaymentMethod" AS ENUM (
      'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO', 'CASH', 'BANK_TRANSFER'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "ChargeStatus" AS ENUM (
      'PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'PENDING_RETRY'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'FAILED', 'PENDING');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "AuditAction" AS ENUM (
      'MEMBER_CREATED', 'MEMBER_UPDATED', 'MEMBER_DELETED',
      'CHARGE_GENERATED', 'CHARGE_CANCELLED', 'PAYMENT_CONFIRMED',
      'PLAN_CREATED', 'PLAN_UPDATED', 'PLAN_DELETED',
      'MESSAGE_SENT'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "AthleteStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "ContractType" AS ENUM (
      'PROFESSIONAL', 'AMATEUR', 'FORMATIVE', 'LOAN'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "ContractStatus" AS ENUM (
      'ACTIVE', 'EXPIRED', 'TERMINATED', 'SUSPENDED'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  DO $$ BEGIN
    CREATE TYPE "SessionType" AS ENUM (
      'MATCH', 'TRAINING', 'GYM', 'RECOVERY', 'OTHER'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  -- Extend AuditAction with athlete actions.
  -- ALTER TYPE ADD VALUE cannot run inside a transaction; provisionTenantSchema
  -- executes this entire block OUTSIDE the transaction (Step 3 below).
  -- ADD VALUE IF NOT EXISTS is available from PostgreSQL 9.6+ and is idempotent.
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATHLETE_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATHLETE_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATHLETE_DELETED';

  -- Same rationale as above — must run outside a transaction block.
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CONTRACT_TERMINATED';

  DO $$ BEGIN
    CREATE TYPE "ExpenseCategory" AS ENUM (
      'SALARY', 'FIELD_MAINTENANCE', 'EQUIPMENT', 'TRAVEL', 'ADMINISTRATIVE', 'OTHER'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
 
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXPENSE_DELETED';

  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BALANCE_SHEET_PUBLISHED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TEMPLATE_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TEMPLATE_RESET';

  DO $$ BEGIN
    CREATE TYPE "ExerciseCategory" AS ENUM (
      'STRENGTH', 'CARDIO', 'TECHNICAL', 'TACTICAL', 'RECOVERY', 'OTHER'
    );
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXERCISE_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXERCISE_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EXERCISE_DELETED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TRAINING_SESSION_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TRAINING_SESSION_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'TRAINING_SESSION_DELETED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVALUATION_CREATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVALUATION_UPDATED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EVALUATION_DELETED';
  ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PARENTAL_CONSENT_RECORDED';
`;

/**
 * All tenant tables in dependency order.
 *
 * Critical notes:
 * - members.cpf and members.phone are BYTEA (not TEXT) — encrypted via pgcrypto.
 * - members.cpf has NO unique constraint — enforced at app layer via findMemberByCpf().
 * - athletes.cpf is BYTEA — encrypted via pgcrypto.
 * - athletes.cpf has NO unique constraint — enforced at app layer via findAthleteByCpf().
 * - athletes.position is TEXT (nullable) to support multiple sport modalities.
 * - charges.gatewayMeta is JSONB to store provider-specific data without schema changes.
 * - audit_log.memberId is nullable (actions may not be tied to a specific member).
 * - Athlete audit entries use entityId / entityType = "Athlete" — no athleteId FK.
 * - contracts.endDate is nullable — open-ended contracts are valid.
 * - contracts.bidRegistered defaults to false — explicit opt-in after CBF/FPF registration.
 * - contracts have NO unique constraint on athleteId — historical records accumulate;
 *   at-most-one ACTIVE contract per athlete is enforced at the service layer.
 * - Contract audit entries use entityId / entityType = "Contract" — no dedicated FK.
 * - Contracts are never deleted — only transitioned to TERMINATED (immutability).
 * - workload_metrics.trainingSessionId is nullable TEXT — FK to training_sessions is
 * - workload_metrics.rpe stores Foster RPE 1–10 (FIFA standard); range enforced by Zod.
 * - workload_metrics derived load (AU = rpe × durationMinutes) is NOT stored here —
 *   it is computed in the MATERIALIZED VIEW.
 * - exercises.isActive uses soft-delete to preserve session_exercises references.
 * - training_sessions.isCompleted = true makes the session immutable (no DELETE allowed).
 * - session_exercises.order is advisory (UI-managed); NOT enforced unique.
 */
const TENANT_TABLES_DDL = `
  -- plans (no FK dependencies)
  CREATE TABLE IF NOT EXISTS "plans" (
    "id"          TEXT          NOT NULL,
    "name"        TEXT          NOT NULL,
    "priceCents"  INTEGER       NOT NULL,
    "interval"    "PlanInterval" NOT NULL DEFAULT 'monthly',
    "benefits"    TEXT[]        NOT NULL DEFAULT '{}',
    "isActive"    BOOLEAN       NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
  );

  -- members (no FK dependencies)
  -- cpf and phone are BYTEA: encrypted via pgp_sym_encrypt (pgcrypto AES-256).
  -- cpf has NO unique index — uniqueness enforced by findMemberByCpf() in src/lib/crypto.ts.
  CREATE TABLE IF NOT EXISTS "members" (
    "id"        TEXT           NOT NULL,
    "name"      TEXT           NOT NULL,
    "cpf"       BYTEA          NOT NULL,
    "phone"     BYTEA          NOT NULL,
    "email"     TEXT,
    "status"    "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
  );

  -- member_plans (FK → members, plans)
  CREATE TABLE IF NOT EXISTS "member_plans" (
    "id"        TEXT         NOT NULL,
    "memberId"  TEXT         NOT NULL,
    "planId"    TEXT         NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"   TIMESTAMP(3),

    CONSTRAINT "member_plans_pkey" PRIMARY KEY ("id")
  );

  -- charges (FK → members)
  CREATE TABLE IF NOT EXISTS "charges" (
    "id"          TEXT            NOT NULL,
    "memberId"    TEXT            NOT NULL,
    "amountCents" INTEGER         NOT NULL,
    "dueDate"     TIMESTAMP(3)    NOT NULL,
    "status"      "ChargeStatus"  NOT NULL DEFAULT 'PENDING',
    "method"      "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "gatewayName" TEXT,
    "externalId"  TEXT,
    "gatewayMeta" JSONB,
    "retryCount"  INTEGER         NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)    NOT NULL,

    CONSTRAINT "charges_pkey" PRIMARY KEY ("id")
  );

  -- payments (FK → charges)
  CREATE TABLE IF NOT EXISTS "payments" (
    "id"           TEXT            NOT NULL,
    "chargeId"     TEXT            NOT NULL,
    "paidAt"       TIMESTAMP(3)    NOT NULL,
    "method"       "PaymentMethod" NOT NULL,
    "amountCents"  INTEGER         NOT NULL,
    "gatewayTxid"  TEXT            NOT NULL,
    "cancelledAt"  TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt"    TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
  );

  -- messages (FK → members)
  CREATE TABLE IF NOT EXISTS "messages" (
    "id"         TEXT             NOT NULL,
    "memberId"   TEXT             NOT NULL,
    "channel"    "MessageChannel" NOT NULL,
    "template"   TEXT             NOT NULL,
    "status"     "MessageStatus"  NOT NULL DEFAULT 'PENDING',
    "sentAt"     TIMESTAMP(3),
    "failReason" TEXT,
    "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
  );

  -- message_templates
  CREATE TABLE IF NOT EXISTS "message_templates" (
    "id"        TEXT             NOT NULL,
    "key"       TEXT             NOT NULL,
    "channel"   "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "body"      TEXT             NOT NULL,
    "isActive"  BOOLEAN          NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
  );

  -- audit_log (FK → members, nullable)
  CREATE TABLE IF NOT EXISTS "audit_log" (
    "id"         TEXT          NOT NULL,
    "memberId"   TEXT,
    "actorId"    TEXT,
    "action"     "AuditAction" NOT NULL,
    "entityId"   TEXT,
    "entityType" TEXT,
    "metadata"   JSONB,
    "createdAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
  );

  -- athletes (no FK dependencies)
  CREATE TABLE IF NOT EXISTS "athletes" (
    "id"        TEXT             NOT NULL,
    "name"      TEXT             NOT NULL,
    "cpf"       BYTEA            NOT NULL,
    "birthDate" DATE             NOT NULL,
    "position"  TEXT,
    "status"    "AthleteStatus"  NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "athletes_pkey" PRIMARY KEY ("id")
  );

  -- contracts (FK → athletes)
  CREATE TABLE IF NOT EXISTS "contracts" (
    "id"             TEXT              NOT NULL,
    "athleteId"      TEXT              NOT NULL,
    "type"           "ContractType"    NOT NULL,
    "status"         "ContractStatus"  NOT NULL DEFAULT 'ACTIVE',
    "startDate"      DATE              NOT NULL,
    "endDate"        DATE,
    "bidRegistered"  BOOLEAN           NOT NULL DEFAULT false,
    "federationCode" TEXT,
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)      NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
  );

  -- workload_metrics (FK → athletes; FK → training_sessions added in TENANT_FOREIGN_KEYS_DDL)
  CREATE TABLE IF NOT EXISTS "workload_metrics" (
    "id"                TEXT          NOT NULL,
    "athleteId"         TEXT          NOT NULL,
    "trainingSessionId" TEXT,
    "date"              DATE          NOT NULL,
    "rpe"               INTEGER       NOT NULL,
    "durationMinutes"   INTEGER       NOT NULL,
    "sessionType"       "SessionType" NOT NULL DEFAULT 'TRAINING',
    "notes"             TEXT,
    "idempotencyKey"    TEXT,
    "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)  NOT NULL,
 
    CONSTRAINT "workload_metrics_pkey" PRIMARY KEY ("id")
  );

  -- rules_config
  CREATE TABLE IF NOT EXISTS "rules_config" (
    "id"        TEXT         NOT NULL,
    "season"    TEXT         NOT NULL,
    "league"    TEXT         NOT NULL,
    "rules"     JSONB        NOT NULL,
    "isActive"  BOOLEAN      NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rules_config_pkey" PRIMARY KEY ("id")
  );

  -- expenses (no FK dependencies)
  CREATE TABLE IF NOT EXISTS "expenses" (
    "id"          TEXT                NOT NULL,
    "description" TEXT                NOT NULL,
    "amountCents" INTEGER             NOT NULL,
    "category"    "ExpenseCategory"   NOT NULL DEFAULT 'OTHER',
    "date"        DATE                NOT NULL,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
  );

  -- balance_sheets (no FK dependencies; append-only)
  CREATE TABLE IF NOT EXISTS "balance_sheets" (
    "id"          TEXT         NOT NULL,
    "title"       TEXT         NOT NULL,
    "period"      TEXT         NOT NULL,
    "fileUrl"     TEXT         NOT NULL,
    "fileHash"    TEXT         NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "balance_sheets_pkey" PRIMARY KEY ("id")
  );

  -- Soft-deleted via isActive=false to preserve session_exercises references.
  -- muscleGroups is a TEXT[] for free-form multi-sport support.
  CREATE TABLE IF NOT EXISTS "exercises" (
    "id"           TEXT                NOT NULL,
    "name"         TEXT                NOT NULL,
    "description"  TEXT,
    "category"     "ExerciseCategory"  NOT NULL DEFAULT 'OTHER',
    "muscleGroups" TEXT[]              NOT NULL DEFAULT '{}',
    "isActive"     BOOLEAN             NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
  );

  -- isCompleted = true makes the session immutable — only incomplete sessions may be deleted.
  -- scheduledAt stores the UTC timestamp of the planned session start.
  CREATE TABLE IF NOT EXISTS "training_sessions" (
    "id"              TEXT          NOT NULL,
    "title"           TEXT          NOT NULL,
    "scheduledAt"     TIMESTAMP(3)  NOT NULL,
    "sessionType"     "SessionType" NOT NULL DEFAULT 'TRAINING',
    "durationMinutes" INTEGER       NOT NULL,
    "notes"           TEXT,
    "isCompleted"     BOOLEAN       NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)  NOT NULL,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
  );

  -- order is advisory (UI-managed sequence); NOT enforced unique.
  -- Unique constraint on (trainingSessionId, exerciseId) prevents duplicate entries per session.
  CREATE TABLE IF NOT EXISTS "session_exercises" (
    "id"                TEXT    NOT NULL,
    "trainingSessionId" TEXT    NOT NULL,
    "exerciseId"        TEXT    NOT NULL,
    "order"             INTEGER NOT NULL DEFAULT 0,
    "sets"              INTEGER,
    "reps"              INTEGER,
    "durationSeconds"   INTEGER,
    "notes"             TEXT,

    CONSTRAINT "session_exercises_pkey" PRIMARY KEY ("id")
  );

  -- integration_tokens (FK → athletes)
  -- Allows external devices (Apple Watch, Google Fit companion apps) to push
  -- workload data without a browser session. Token shown once, stored hashed.
  -- isActive = false means revoked; rows are never hard-deleted (audit trail).
  CREATE TABLE IF NOT EXISTS "integration_tokens" (
    "id"          TEXT         NOT NULL,
    "athleteId"   TEXT         NOT NULL,
    "tokenHash"   TEXT         NOT NULL,
    "label"       TEXT         NOT NULL,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "lastUsedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_tokens_pkey" PRIMARY KEY ("id")
  );
`;

/**
 * All indexes on tenant tables. CREATE INDEX IF NOT EXISTS is available from PG 9.5+.
 */
const TENANT_INDEXES_DDL = `
  -- members
  CREATE INDEX IF NOT EXISTS "members_status_idx"
    ON "members" ("status");

  -- member_plans
  CREATE INDEX IF NOT EXISTS "member_plans_planId_idx"
    ON "member_plans" ("planId");
  CREATE UNIQUE INDEX IF NOT EXISTS "member_plans_memberId_planId_key"
    ON "member_plans" ("memberId", "planId");

  -- charges
  CREATE INDEX IF NOT EXISTS "charges_memberId_idx"
    ON "charges" ("memberId");
  CREATE INDEX IF NOT EXISTS "charges_status_idx"
    ON "charges" ("status");
  CREATE INDEX IF NOT EXISTS "charges_dueDate_idx"
    ON "charges" ("dueDate");
  CREATE INDEX IF NOT EXISTS "charges_gatewayName_idx"
    ON "charges" ("gatewayName");

  -- payments
  CREATE UNIQUE INDEX IF NOT EXISTS "payments_chargeId_key"
    ON "payments" ("chargeId");
  CREATE UNIQUE INDEX IF NOT EXISTS "payments_gatewayTxid_key"
    ON "payments" ("gatewayTxid");
  CREATE INDEX IF NOT EXISTS "payments_gatewayTxid_idx"
    ON "payments" ("gatewayTxid");

  -- messages
  CREATE INDEX IF NOT EXISTS "messages_memberId_idx"
    ON "messages" ("memberId");
  CREATE INDEX IF NOT EXISTS "messages_status_idx"
    ON "messages" ("status");

  -- message_templates
  CREATE UNIQUE INDEX IF NOT EXISTS "message_templates_key_channel_key"
    ON "message_templates" ("key", "channel");

  -- audit_log
  CREATE INDEX IF NOT EXISTS "audit_log_action_idx"
    ON "audit_log" ("action");
  CREATE INDEX IF NOT EXISTS "audit_log_memberId_idx"
    ON "audit_log" ("memberId");
  CREATE INDEX IF NOT EXISTS "audit_log_createdAt_idx"
    ON "audit_log" ("createdAt");

  -- athletes
  CREATE INDEX IF NOT EXISTS "athletes_status_idx"
    ON "athletes" ("status");

  -- contracts
  CREATE INDEX IF NOT EXISTS "contracts_athleteId_idx"
    ON "contracts" ("athleteId");
  CREATE INDEX IF NOT EXISTS "contracts_status_idx"
    ON "contracts" ("status");
  CREATE INDEX IF NOT EXISTS "contracts_endDate_idx"
    ON "contracts" ("endDate");

  -- workload_metrics
  CREATE INDEX IF NOT EXISTS "workload_metrics_date_brin_idx"
    ON "workload_metrics" USING BRIN ("date");
  CREATE INDEX IF NOT EXISTS "workload_metrics_athleteId_idx"
    ON "workload_metrics" ("athleteId");
  CREATE INDEX IF NOT EXISTS "workload_metrics_athleteId_date_idx"
    ON "workload_metrics" ("athleteId", "date");
  CREATE UNIQUE INDEX IF NOT EXISTS "workload_metrics_idempotencyKey_key"
    ON "workload_metrics" ("idempotencyKey");

  -- rules_config
  CREATE UNIQUE INDEX IF NOT EXISTS "rules_config_season_league_key"
    ON "rules_config" ("season", "league");
  CREATE INDEX IF NOT EXISTS "rules_config_isActive_idx"
    ON "rules_config" ("isActive");

  -- expenses
  CREATE INDEX IF NOT EXISTS "expenses_date_idx"
    ON "expenses" ("date");
  CREATE INDEX IF NOT EXISTS "expenses_category_idx"
    ON "expenses" ("category");

  -- balance_sheets
  CREATE INDEX IF NOT EXISTS "balance_sheets_publishedAt_idx"
    ON "balance_sheets" ("publishedAt" DESC);

  CREATE INDEX IF NOT EXISTS "exercises_category_idx"
    ON "exercises" ("category");
  CREATE INDEX IF NOT EXISTS "exercises_isActive_idx"
    ON "exercises" ("isActive");

  CREATE INDEX IF NOT EXISTS "training_sessions_scheduledAt_idx"
    ON "training_sessions" ("scheduledAt");
  CREATE INDEX IF NOT EXISTS "training_sessions_sessionType_idx"
    ON "training_sessions" ("sessionType");
  CREATE INDEX IF NOT EXISTS "training_sessions_isCompleted_idx"
    ON "training_sessions" ("isCompleted");

  CREATE INDEX IF NOT EXISTS "session_exercises_trainingSessionId_idx"
    ON "session_exercises" ("trainingSessionId");
  CREATE INDEX IF NOT EXISTS "session_exercises_exerciseId_idx"
    ON "session_exercises" ("exerciseId");
  CREATE UNIQUE INDEX IF NOT EXISTS "session_exercises_sessionId_exerciseId_key"
    ON "session_exercises" ("trainingSessionId", "exerciseId");

  -- integration_tokens
  CREATE INDEX IF NOT EXISTS "integration_tokens_athleteId_idx"
    ON "integration_tokens" ("athleteId");
  CREATE INDEX IF NOT EXISTS "integration_tokens_isActive_idx"
    ON "integration_tokens" ("isActive");
`;

/**
 * Foreign key constraints on tenant tables.
 */
const TENANT_FOREIGN_KEYS_DDL = `
  -- member_plans → members
  ALTER TABLE "member_plans"
    ADD CONSTRAINT IF NOT EXISTS "member_plans_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- member_plans → plans
  ALTER TABLE "member_plans"
    ADD CONSTRAINT IF NOT EXISTS "member_plans_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- charges → members
  ALTER TABLE "charges"
    ADD CONSTRAINT IF NOT EXISTS "charges_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- payments → charges
  ALTER TABLE "payments"
    ADD CONSTRAINT IF NOT EXISTS "payments_chargeId_fkey"
    FOREIGN KEY ("chargeId") REFERENCES "charges" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- messages → members
  ALTER TABLE "messages"
    ADD CONSTRAINT IF NOT EXISTS "messages_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- audit_log → members (nullable FK)
  ALTER TABLE "audit_log"
    ADD CONSTRAINT IF NOT EXISTS "audit_log_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

  -- contracts → athletes
  ALTER TABLE "contracts"
    ADD CONSTRAINT IF NOT EXISTS "contracts_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- workload_metrics → athletes
  ALTER TABLE "workload_metrics"
    ADD CONSTRAINT IF NOT EXISTS "workload_metrics_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- ON DELETE SET NULL: preserves RPE history even when a planned session is removed.
  ALTER TABLE "workload_metrics"
    ADD CONSTRAINT IF NOT EXISTS "workload_metrics_trainingSessionId_fkey"
    FOREIGN KEY ("trainingSessionId") REFERENCES "training_sessions" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

  -- ON DELETE CASCADE: exercise list is owned by the session plan.
  ALTER TABLE "session_exercises"
    ADD CONSTRAINT IF NOT EXISTS "session_exercises_trainingSessionId_fkey"
    FOREIGN KEY ("trainingSessionId") REFERENCES "training_sessions" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

  -- ON DELETE RESTRICT: prevents deleting an exercise used in any historical session.
  ALTER TABLE "session_exercises"
    ADD CONSTRAINT IF NOT EXISTS "session_exercises_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "exercises" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- integration_tokens → athletes
  ALTER TABLE "integration_tokens"
    ADD CONSTRAINT IF NOT EXISTS "integration_tokens_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
`;

const TENANT_MATERIALIZED_VIEWS_DDL = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS "acwr_aggregates" AS
  WITH daily_load AS (
    SELECT
      "athleteId",
      date,
      SUM(rpe * "durationMinutes")::integer AS daily_au
    FROM workload_metrics
    GROUP BY "athleteId", date
  ),
  windowed AS (
    SELECT
      "athleteId",
      date,
      daily_au,
      SUM(daily_au) OVER (
        PARTITION BY "athleteId"
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      )::integer AS acute_load_au,
      ROUND(
        SUM(daily_au) OVER (
          PARTITION BY "athleteId"
          ORDER BY date
          ROWS BETWEEN 27 PRECEDING AND CURRENT ROW
        )::numeric / 4,
      2) AS chronic_load_au,
      COUNT(*)::integer OVER (
        PARTITION BY "athleteId"
        ORDER BY date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
      ) AS acute_window_days,
      COUNT(*)::integer OVER (
        PARTITION BY "athleteId"
        ORDER BY date
        ROWS BETWEEN 27 PRECEDING AND CURRENT ROW
      ) AS chronic_window_days
    FROM daily_load
  )
  SELECT
    "athleteId",
    date,
    daily_au,
    acute_load_au,
    chronic_load_au,
    acute_window_days,
    chronic_window_days,
    CASE
      WHEN chronic_load_au > 0
        THEN ROUND((acute_load_au::numeric / chronic_load_au), 2)
      ELSE NULL
    END AS acwr_ratio,
    CASE
      WHEN chronic_load_au IS NULL OR chronic_load_au = 0 THEN 'insufficient_data'
      WHEN (acute_load_au::numeric / chronic_load_au) < 0.8  THEN 'low'
      WHEN (acute_load_au::numeric / chronic_load_au) <= 1.3 THEN 'optimal'
      WHEN (acute_load_au::numeric / chronic_load_au) <= 1.5 THEN 'high'
      ELSE 'very_high'
    END AS risk_zone
  FROM windowed
  WITH NO DATA;
`;

const TENANT_MATERIALIZED_VIEW_INDEXES_DDL = `
  CREATE UNIQUE INDEX IF NOT EXISTS "acwr_aggregates_athlete_date_key"
    ON "acwr_aggregates" ("athleteId", date);

  CREATE INDEX IF NOT EXISTS "acwr_aggregates_athlete_idx"
    ON "acwr_aggregates" ("athleteId");
`;

/**
 * Provisions a complete PostgreSQL tenant schema for a new club.
 *
 * Creates the schema `clube_{clubId}` and applies the full tenant DDL
 * (enums, tables, indexes, foreign keys, materialized views) in the correct
 * execution order.
 *
 * **Idempotent** — safe to call multiple times for the same `clubId`.
 * All DDL statements use `IF NOT EXISTS` or equivalent guards.
 *
 * **Execution order rationale:**
 *   Steps 1–3 run outside any transaction because `ALTER TYPE ... ADD VALUE`
 *
 *   Step 4 runs inside a transaction to keep table/index/FK/view creation atomic.
 *
 * @param prisma  - The global Prisma client (public schema connection).
 * @param clubId  - The cuid2 identifier of the new club.
 *
 * @throws {Error} If `clubId` does not match the expected cuid2 format.
 * @throws        Re-throws any PostgreSQL errors from DDL execution.
 */
export async function provisionTenantSchema(
  prisma: PrismaClient,
  clubId: string,
): Promise<void> {
  assertValidClubId(clubId);

  const schemaName = `clube_${clubId}`;

  await prisma.$executeRawUnsafe(PGCRYPTO_DDL);

  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  await prisma.$executeRawUnsafe(`SET search_path TO "${schemaName}", public`);
  await prisma.$executeRawUnsafe(TENANT_ENUMS_DDL);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(`SET search_path TO "${schemaName}", public`);

    await tx.$executeRawUnsafe(TENANT_TABLES_DDL);
    await tx.$executeRawUnsafe(TENANT_INDEXES_DDL);
    await tx.$executeRawUnsafe(TENANT_FOREIGN_KEYS_DDL);

    await tx.$executeRawUnsafe(TENANT_MATERIALIZED_VIEWS_DDL);
    await tx.$executeRawUnsafe(TENANT_MATERIALIZED_VIEW_INDEXES_DDL);
  });
}
