import type { PrismaClient } from "../../generated/prisma/index.js";

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
`;

/**
 * All tenant tables in dependency order.
 *
 * Critical notes:
 * - members.cpf and members.phone are BYTEA (not TEXT) — encrypted via pgcrypto.
 * - members.cpf has NO unique constraint — enforced at app layer via findMemberByCpf().
 * - charges.gatewayMeta is JSONB to store provider-specific data without schema changes.
 * - audit_log.memberId is nullable (actions may not be tied to a specific member).
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

  -- audit_log
  CREATE INDEX IF NOT EXISTS "audit_log_action_idx"
    ON "audit_log" ("action");
  CREATE INDEX IF NOT EXISTS "audit_log_memberId_idx"
    ON "audit_log" ("memberId");
  CREATE INDEX IF NOT EXISTS "audit_log_createdAt_idx"
    ON "audit_log" ("createdAt");
`;

/**
 * Foreign key constraints on tenant tables.
 *
 * ALTER TABLE ... ADD CONSTRAINT ... IF NOT EXISTS requires PG 9.6+.
 * All constraints are named to allow idempotent re-application.
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
`;

/**
 * Provisions a complete PostgreSQL tenant schema for a new club.
 *
 * Creates the schema `clube_{clubId}` and applies the full tenant DDL
 * (enums, tables, indexes, foreign keys) inside a single transaction.
 *
 * **Idempotent** — safe to call multiple times for the same `clubId`.
 * All DDL statements use `IF NOT EXISTS` or equivalent guards.
 *
 * Called once during club onboarding by `POST /api/clubs` (T-002).
 * Must NOT be called for every request — only at club creation time.
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

  // Step 1 — Ensure pgcrypto is available.
  // Runs in the public schema (no search_path override needed).
  // Required before any tenant table creation because members.cpf/phone
  // use pgp_sym_encrypt which depends on this extension.
  await prisma.$executeRawUnsafe(PGCRYPTO_DDL);

  // Step 2 — Create the tenant schema (idempotent).
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // Step 3 — Apply all tenant DDL inside a single transaction.
  // The transaction ensures atomicity: either the schema is fully provisioned
  // or nothing is committed. The SET search_path scopes all subsequent DDL
  // to the new tenant schema for the duration of the transaction.
  await prisma.$transaction(async (tx) => {
    const p = tx as unknown as PrismaClient;

    await p.$executeRawUnsafe(`SET search_path TO "${schemaName}", public`);

    await p.$executeRawUnsafe(TENANT_ENUMS_DDL);
    await p.$executeRawUnsafe(TENANT_TABLES_DDL);
    await p.$executeRawUnsafe(TENANT_INDEXES_DDL);
    await p.$executeRawUnsafe(TENANT_FOREIGN_KEYS_DDL);
  });
}
