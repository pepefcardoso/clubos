/**
 *
 * These tests run against a real PostgreSQL instance. The DATABASE_URL env var
 * must point to a test database (e.g. clubos_test). The CI pipeline provides
 * this via the postgres service in GitHub Actions.
 *
 * Tests are isolated: each test uses a unique clubId so schemas do not collide,
 * and all created schemas are dropped in afterEach to keep the DB clean.
 *
 * Run with:
 *   DATABASE_URL=postgresql://clubos:clubos@localhost:5432/clubos_test \
 *   MEMBER_ENCRYPTION_KEY=test-key-that-is-at-least-32-chars!! \
 *   pnpm --filter api vitest run src/lib/tenant-schema.contracts.test.ts
 *
 * When DATABASE_URL is not set the entire suite is skipped automatically.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { PrismaClient } from "../../generated/prisma/index.js";
import { provisionTenantSchema } from "./tenant-schema.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? process.env["TEST_DATABASE_URL"];

const hasDatabase = Boolean(DATABASE_URL);

function makeTestClubId(): string {
  const rand = Math.random().toString(36).slice(2).padEnd(20, "0").slice(0, 20);
  return `test${rand}`;
}

type Row = Record<string, unknown>;

let prisma: PrismaClient;

beforeAll(() => {
  if (!hasDatabase) return;

  process.env["DATABASE_URL"] = DATABASE_URL!;
  prisma = new PrismaClient({ log: [] });
});

const createdSchemas: string[] = [];

afterEach(async () => {
  if (!hasDatabase) return;
  for (const schema of createdSchemas.splice(0)) {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

describe.skipIf(!hasDatabase)("provisionTenantSchema — contracts table", () => {
  it("is idempotent — calling twice for the same clubId does not throw", async () => {
    const clubId = makeTestClubId();
    createdSchemas.push(`clube_${clubId}`);

    await expect(
      provisionTenantSchema(prisma, clubId),
    ).resolves.toBeUndefined();
    await expect(
      provisionTenantSchema(prisma, clubId),
    ).resolves.toBeUndefined();
  });

  it("creates the contracts table", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ${schemaName}
          AND table_name   = 'contracts'
          AND table_type   = 'BASE TABLE'
      `;
    expect(result).toHaveLength(1);
  });

  it("total tenant table count is now 8 (7 original + contracts)", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ${schemaName}
          AND table_type   = 'BASE TABLE'
        ORDER BY table_name
      `;

    const names = result.map((r) => r["table_name"] as string);
    expect(names).toEqual(
      expect.arrayContaining([
        "audit_log",
        "charges",
        "contracts",
        "member_plans",
        "members",
        "messages",
        "payments",
        "plans",
      ]),
    );
    expect(names).toHaveLength(8);
  });

  it("creates contracts with the correct column types", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<
      { column_name: string; data_type: string; is_nullable: string }[]
    >`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = ${schemaName}
          AND table_name   = 'contracts'
        ORDER BY ordinal_position
      `;

    const byName = Object.fromEntries(result.map((r) => [r.column_name, r]));

    expect(byName["id"]?.data_type).toBe("text");
    expect(byName["id"]?.is_nullable).toBe("NO");

    expect(byName["athleteId"]?.data_type).toBe("text");
    expect(byName["athleteId"]?.is_nullable).toBe("NO");

    expect(byName["type"]?.data_type).toBe("USER-DEFINED");
    expect(byName["type"]?.is_nullable).toBe("NO");
    expect(byName["status"]?.data_type).toBe("USER-DEFINED");
    expect(byName["status"]?.is_nullable).toBe("NO");

    expect(byName["startDate"]?.data_type).toBe("date");
    expect(byName["startDate"]?.is_nullable).toBe("NO");
    expect(byName["endDate"]?.data_type).toBe("date");
    expect(byName["endDate"]?.is_nullable).toBe("YES");

    expect(byName["bidRegistered"]?.data_type).toBe("boolean");
    expect(byName["bidRegistered"]?.is_nullable).toBe("NO");

    expect(byName["federationCode"]?.data_type).toBe("text");
    expect(byName["federationCode"]?.is_nullable).toBe("YES");
    expect(byName["notes"]?.data_type).toBe("text");
    expect(byName["notes"]?.is_nullable).toBe("YES");

    expect(byName["createdAt"]?.data_type).toBe("timestamp without time zone");
    expect(byName["createdAt"]?.is_nullable).toBe("NO");
    expect(byName["updatedAt"]?.data_type).toBe("timestamp without time zone");
    expect(byName["updatedAt"]?.is_nullable).toBe("NO");
  });

  it("status column defaults to ACTIVE", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<{ column_default: string }[]>`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema  = ${schemaName}
          AND table_name    = 'contracts'
          AND column_name   = 'status'
      `;
    expect(result[0]?.column_default).toContain("ACTIVE");
  });

  it("bidRegistered column defaults to false", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<{ column_default: string }[]>`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema  = ${schemaName}
          AND table_name    = 'contracts'
          AND column_name   = 'bidRegistered'
      `;
    expect(result[0]?.column_default).toBe("false");
  });

  it("creates contracts_athleteId_idx", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
        SELECT ix.relname AS index_name
        FROM pg_index i
        JOIN pg_class t  ON t.oid = i.indrelid
        JOIN pg_class ix ON ix.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname  = ${schemaName}
          AND t.relname  = 'contracts'
          AND ix.relname = 'contracts_athleteId_idx'
      `;
    expect(result).toHaveLength(1);
  });

  it("creates contracts_status_idx", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
        SELECT ix.relname AS index_name
        FROM pg_index i
        JOIN pg_class t  ON t.oid = i.indrelid
        JOIN pg_class ix ON ix.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname  = ${schemaName}
          AND t.relname  = 'contracts'
          AND ix.relname = 'contracts_status_idx'
      `;
    expect(result).toHaveLength(1);
  });

  it("creates contracts_endDate_idx", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
        SELECT ix.relname AS index_name
        FROM pg_index i
        JOIN pg_class t  ON t.oid = i.indrelid
        JOIN pg_class ix ON ix.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname  = ${schemaName}
          AND t.relname  = 'contracts'
          AND ix.relname = 'contracts_endDate_idx'
      `;
    expect(result).toHaveLength(1);
  });

  it("does NOT create a unique index on contracts.athleteId (historical records allowed)", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
        SELECT ix.relname AS index_name
        FROM pg_index i
        JOIN pg_class t  ON t.oid = i.indrelid
        JOIN pg_class ix ON ix.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
        WHERE n.nspname   = ${schemaName}
          AND t.relname   = 'contracts'
          AND a.attname   = 'athleteId'
          AND i.indisunique = true
      `;
    expect(result).toHaveLength(0);
  });

  it("enforces FK — inserting contract with unknown athleteId throws", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    await prisma.$executeRawUnsafe(
      `SET search_path TO "${schemaName}", public`,
    );

    await expect(
      prisma.$executeRaw`
          INSERT INTO "contracts" (
            id, "athleteId", type, "startDate", "updatedAt"
          ) VALUES (
            'fk-test-id',
            'non-existent-athlete-id',
            'PROFESSIONAL',
            CURRENT_DATE,
            NOW()
          )
        `,
    ).rejects.toThrow();
  });

  it("accepts CONTRACT_CREATED as a valid AuditAction", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    await prisma.$executeRawUnsafe(
      `SET search_path TO "${schemaName}", public`,
    );

    await expect(
      prisma.$executeRaw`
          INSERT INTO "audit_log" (id, action, "createdAt")
          VALUES ('audit-contract-created', 'CONTRACT_CREATED', NOW())
        `,
    ).resolves.not.toThrow();
  });

  it("accepts CONTRACT_UPDATED as a valid AuditAction", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    await prisma.$executeRawUnsafe(
      `SET search_path TO "${schemaName}", public`,
    );

    await expect(
      prisma.$executeRaw`
          INSERT INTO "audit_log" (id, action, "createdAt")
          VALUES ('audit-contract-updated', 'CONTRACT_UPDATED', NOW())
        `,
    ).resolves.not.toThrow();
  });

  it("accepts CONTRACT_TERMINATED as a valid AuditAction", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    await prisma.$executeRawUnsafe(
      `SET search_path TO "${schemaName}", public`,
    );

    await expect(
      prisma.$executeRaw`
          INSERT INTO "audit_log" (id, action, "createdAt")
          VALUES ('audit-contract-terminated', 'CONTRACT_TERMINATED', NOW())
        `,
    ).resolves.not.toThrow();
  });

  it("ContractType enum has all four expected values", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<{ enumlabel: string }[]>`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'ContractType'
        ORDER BY e.enumsortorder
      `;
    const labels = result.map((r) => r.enumlabel);
    expect(labels).toEqual(
      expect.arrayContaining(["PROFESSIONAL", "AMATEUR", "FORMATIVE", "LOAN"]),
    );
    expect(labels).toHaveLength(4);
  });

  it("ContractStatus enum has all four expected values", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<{ enumlabel: string }[]>`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'ContractStatus'
        ORDER BY e.enumsortorder
      `;
    const labels = result.map((r) => r.enumlabel);
    expect(labels).toEqual(
      expect.arrayContaining(["ACTIVE", "EXPIRED", "TERMINATED", "SUSPENDED"]),
    );
    expect(labels).toHaveLength(4);
  });

  it("all original tenant tables still exist after provisioning", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ${schemaName}
          AND table_type   = 'BASE TABLE'
        ORDER BY table_name
      `;
    const names = result.map((r) => r["table_name"] as string);

    for (const table of [
      "audit_log",
      "charges",
      "member_plans",
      "members",
      "messages",
      "payments",
      "plans",
    ]) {
      expect(names).toContain(table);
    }
  });
});
