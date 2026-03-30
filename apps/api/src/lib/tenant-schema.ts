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
 * - workload_metrics.trainingSessionId is nullable TEXT — FK to training_sessions will
 *   be added in T-101 once that table exists, to avoid a blocking dependency.
 * - workload_metrics.rpe stores Foster RPE 1–10 (FIFA standard); range enforced by Zod.
 * - workload_metrics derived load (AU = rpe × durationMinutes) is NOT stored here —
 *   it is computed in the MATERIALIZED VIEW.
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
  -- Stores club-level overrides for the three billing reminder template keys.
  -- When no row exists for a (key, channel) pair, the application falls back
  -- to the hard-coded DEFAULT_TEMPLATES constants in templates.constants.ts.
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
  -- Athlete audit entries reference athletes via entityId / entityType = "Athlete"
  -- rather than a dedicated athleteId FK column, keeping the audit model generic.
  -- Contract audit entries use entityId / entityType = "Contract" — same pattern.
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
  -- cpf is BYTEA: encrypted via pgp_sym_encrypt (pgcrypto AES-256).
  -- cpf has NO unique index — uniqueness enforced by findAthleteByCpf() in src/lib/crypto.ts.
  -- position is free-text to support multiple sport modalities (futebol, vôlei, etc.).
  -- birthDate is DATE (time component always midnight UTC).
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
  -- endDate is nullable: open-ended contracts are valid (e.g. ongoing formative contracts).
  -- bidRegistered defaults to false; set true after CBF/FPF BID confirmation.
  -- federationCode is nullable: populated only after BID registration is confirmed.
  -- No unique constraint on athleteId: historical records accumulate across an athlete's
  -- career (original contract, renewals, loan stints). At-most-one ACTIVE contract per
  -- athlete is enforced at the service layer to allow concurrent transitions.
  -- Contracts are never deleted — only transitioned to TERMINATED (immutability principle).
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

  -- workload_metrics (FK → athletes)
  -- Stores raw Foster Session-RPE training load inputs per athlete per day.
  -- rpe: integer 1–10 (FIFA standard; NOT NULL — a zero-RPE session is not a session).
  -- durationMinutes: must be > 0; enforced at the application layer via Zod.
  -- trainingSessionId: nullable TEXT — FK to training_sessions will be added
  --   once that table exists, avoiding a blocking dependency.
  -- date is a DATE column (time component always midnight UTC); BRIN-indexed below.
  -- Training Load (AU) = rpe × durationMinutes is intentionally NOT stored here —
  --   it is derived in the MATERIALIZED VIEW.
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
  -- Stores per-season, per-league sports eligibility rule sets as JSONB.
  -- Rules are parameterised and updatable via API without code deployment.
  -- A club may have multiple active rule sets (e.g. CBF + FPF simultaneously).
  -- season + league unique constraint is enforced in TENANT_INDEXES_DDL.
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
  -- amountCents: integer cents — never float.
  -- date is DATE (time component always midnight UTC).
  -- notes is nullable free-text for the treasurer's reference.
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

  -- balance_sheets (no FK dependencies)
  -- Append-only by application contract: no UPDATE or DELETE is ever issued.
  -- fileHash stores the SHA-256 hex digest of the original PDF for tamper-evidence
  --   (Lei 14.193/2021 compliance).
  -- publishedAt is indexed DESC so public listing queries are fast.
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
`;

/**
 * All indexes on tenant tables. CREATE INDEX IF NOT EXISTS is available from PG 9.5+.
 *
 * workload_metrics index strategy:
 *   - BRIN on "date": Block Range INdex — stores only min/max per physical page range,
 *     making it ~100–1000x smaller than B-tree for time-series data. Optimal here because
 *     rows are inserted in roughly chronological order as sessions are logged. The ACWR
 *     materialized view uses range scans on date (e.g. WHERE date >= NOW() -
 *     INTERVAL '28 days'), which BRIN handles efficiently. pages_per_range=32 (default).
 *   - B-tree on "athleteId": supports per-athlete lookups in dashboard and ACWR queries.
 *   - Composite B-tree on ("athleteId", "date"): covers the most frequent query pattern —
 *     load history for a specific athlete over a date range (ACWR window lookups, charts).
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
  -- contracts_athleteId_idx: supports athlete-scoped contract lookups (GET /api/athletes/:id/contracts)
  -- contracts_status_idx: supports filtering active contracts
  -- contracts_endDate_idx: supports alert query (WHERE endDate <= NOW() + interval '7 days')
  CREATE INDEX IF NOT EXISTS "contracts_athleteId_idx"
    ON "contracts" ("athleteId");
  CREATE INDEX IF NOT EXISTS "contracts_status_idx"
    ON "contracts" ("status");
  CREATE INDEX IF NOT EXISTS "contracts_endDate_idx"
    ON "contracts" ("endDate");

  -- workload_metrics
  -- BRIN on "date": optimal for time-series range scans used by the ACWR materialized
  --   view. Rows are inserted chronologically, so BRIN's block-range correlation
  --   assumption holds. pages_per_range=32 (PostgreSQL default).
  -- B-tree on "athleteId": per-athlete dashboard and ACWR lookup support.
  -- Composite ("athleteId", "date"): covers the dominant query pattern — load history
  --   for a specific athlete over a trailing window (e.g. 28-day ACWR calculation).
  CREATE INDEX IF NOT EXISTS "workload_metrics_date_brin_idx"
    ON "workload_metrics" USING BRIN ("date");
  CREATE INDEX IF NOT EXISTS "workload_metrics_athleteId_idx"
    ON "workload_metrics" ("athleteId");
  CREATE INDEX IF NOT EXISTS "workload_metrics_athleteId_date_idx"
    ON "workload_metrics" ("athleteId", "date");
  -- Unique index on idempotencyKey: prevents duplicate rows from PWA retries
  -- (belt-and-suspenders alongside the application-level check in the service).
  -- Partial WHERE is not used here so the index correctly enforces global uniqueness
  -- across all rows where the key is non-null (NULL values are excluded from UNIQUE
  -- indexes in PostgreSQL by default — multiple NULLs are allowed).
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
`;

/**
 * Foreign key constraints on tenant tables.
 *
 * ALTER TABLE ... ADD CONSTRAINT ... IF NOT EXISTS requires PG 9.6+.
 * All constraints are named to allow idempotent re-application.
 *
 * Note: contracts → athletes uses ON DELETE RESTRICT to prevent accidental deletion
 * of athletes that have legal/compliance contract records.
 *
 * Note: workload_metrics → training_sessions FK, when the
 * training_sessions table will be created. trainingSessionId is nullable TEXT for now.
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
  -- ON DELETE RESTRICT: prevents deleting an athlete that has contract records,
  -- preserving legal and CBF/FPF compliance history.
  ALTER TABLE "contracts"
    ADD CONSTRAINT IF NOT EXISTS "contracts_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- workload_metrics → athletes
  -- ON DELETE RESTRICT: preserves training load history even if an athlete is
  -- deactivated; hard delete of an athlete with load data is intentionally blocked
  -- to protect ACWR history and any future injury-prediction models (v2.0).
  ALTER TABLE "workload_metrics"
    ADD CONSTRAINT IF NOT EXISTS "workload_metrics_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "athletes" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  -- NOTE: FK for workload_metrics → training_sessions will be added
  -- once that table is defined. trainingSessionId is nullable TEXT for now.
`;

/**
 * Materialized view for ACWR (Acute:Chronic Workload Ratio) aggregates.
 *
 * Computes, per athlete per day, the rolling acute (7-day) and chronic
 * (28-day) training loads from raw workload_metrics entries and derives
 * the ACWR ratio and risk zone used by the dashboard.
 *
 * Training Load Unit (AU) = rpe × durationMinutes  (Foster Session-RPE)
 * Acute  Load = SUM(AU) over last 7 days
 * Chronic Load = SUM(AU over last 28 days) / 4   (weekly average)
 * ACWR = Acute / Chronic
 *
 * Risk zones (FIFA / sports science standard):
 *   < 0.8   → low             (under-training / detraining)
 *   0.8–1.3 → optimal         (continue load)
 *   1.3–1.5 → high            (monitor athlete)
 *   > 1.5   → very_high       (reduce load — injury risk)
 *   no data → insufficient_data
 *
 * Created WITH NO DATA — initial population is handled by migration
 * script; subsequent refreshes BullMQ job (every 4 hours).
 *
 * REFRESH MATERIALIZED VIEW CONCURRENTLY requires the unique index created
 * in TENANT_MATERIALIZED_VIEW_INDEXES_DDL — that index must exist before
 * the first concurrent refresh is attempted.
 *
 * Design decisions:
 *   - ROWS BETWEEN N PRECEDING AND CURRENT ROW: correctly handles sparse data
 *     (days with no sessions are simply absent — the window shrinks naturally).
 *   - chronic_load_au = SUM(28d) / 4: normalises to weekly average, matching
 *     the standard ACWR literature formula.
 *   - ROUND(..., 2) on acwr_ratio: 2 dp is sufficient for UI; avoids fp noise.
 *   - risk_zone computed in view: single source of truth, avoids repeating logic.
 *   - No "id" column: the natural key is ("athleteId", date), enforced by the
 *     unique index. Raw queries use this pair for addressing.
 */
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

/**
 * Indexes on the acwr_aggregates materialized view.
 *
 * The unique index on ("athleteId", date) serves two purposes:
 *   1. Data integrity — exactly one aggregate row per athlete per day.
 *   2. REFRESH MATERIALIZED VIEW CONCURRENTLY — PostgreSQL requires a unique
 *      index on the view before a concurrent refresh can be executed.
 *
 * B-tree is used (not BRIN) because materialized views are physically rewritten
 * on REFRESH, meaning rows are NOT guaranteed to land in physical date order.
 * BRIN's block-range correlation assumption would fail here.
 *
 * The second index on "athleteId" alone supports per-athlete full-history queries
 * and dashboard lookups that do not include a date filter.
 */
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
 *   (used to extend `AuditAction` with athlete and contract values) cannot be
 *   executed inside an open transaction block in PostgreSQL. This is a PostgreSQL
 *   restriction, not a Prisma limitation.
 *
 *   Step 4 runs inside a transaction to keep table/index/FK/view creation atomic.
 *   A failure there leaves enums created but tables absent — re-running
 *   `provisionTenantSchema` is the safe recovery path (all DDL is idempotent).
 *
 * Called once during club onboarding by `POST /api/clubs`.
 * Must NOT be called for every request — only at club creation time.
 * Can be called safely for existing clubs due to idempotency.
 *
 * @param prisma  - The global Prisma client (public schema connection).
 * @param clubId  - The cuid2 identifier of the new club. Used to derive
 *                  the schema name `clube_{clubId}`.
 *
 * @throws {Error} If `clubId` does not match the expected cuid2 format.
 * @throws        Re-throws any PostgreSQL errors from DDL execution.
 *
 * @example
 * ```ts
 * const club = await prisma.club.create({ data: { ... } });
 * await provisionTenantSchema(prisma, club.id);
 * ```
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
