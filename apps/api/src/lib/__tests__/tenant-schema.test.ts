/**
 * Integration tests for provisionTenantSchema (T-001).
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
 *   pnpm --filter api vitest run src/lib/__tests__/tenant-schema.test.ts
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { PrismaClient } from "../../../generated/prisma/index.js";
import { provisionTenantSchema } from "../tenant-schema.js";


/**
 * Generates a unique clubId for each test to avoid schema collisions.
 * Must match the cuid2 pattern: lowercase alphanumeric, 20–30 chars.
 */
function makeTestClubId(): string {
  const rand = Math.random().toString(36).slice(2).padEnd(20, "0").slice(0, 20);
  return `test${rand}`;
}

type Row = Record<string, unknown>;


let prisma: PrismaClient;

beforeAll(() => {
  prisma = new PrismaClient({
    log: [],
    datasources: {
      db: {
        url:
          process.env["DATABASE_URL"] ??
          "postgresql://clubos:clubos@localhost:5432/clubos_test",
      },
    },
  });
});

const createdSchemas: string[] = [];

afterEach(async () => {
  for (const schema of createdSchemas.splice(0)) {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

describe("provisionTenantSchema", () => {
  it("creates the tenant schema for a new clubId", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = ${schemaName}
    `;
    expect(result).toHaveLength(1);
  });

  it("creates all expected tenant tables", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schemaName}
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const tableNames = result.map((r) => r["table_name"] as string);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "audit_log",
        "charges",
        "member_plans",
        "members",
        "messages",
        "payments",
        "plans",
      ]),
    );
    expect(tableNames).toHaveLength(7);
  });

  it("creates members.cpf and members.phone as BYTEA columns", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = ${schemaName}
        AND table_name   = 'members'
        AND column_name IN ('cpf', 'phone')
      ORDER BY column_name
    `;

    expect(result).toHaveLength(2);
    for (const row of result) {
      expect(row["data_type"]).toBe("bytea");
    }
  });

  it("does NOT create a unique index on members.cpf", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT ix.relname AS index_name, ix.relkind
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class ix ON ix.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
      WHERE n.nspname = ${schemaName}
        AND t.relname = 'members'
        AND a.attname = 'cpf'
        AND i.indisunique = true
    `;

    expect(result).toHaveLength(0);
  });

  it("is idempotent — calling twice for the same clubId does not throw", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await expect(
      provisionTenantSchema(prisma, clubId),
    ).resolves.toBeUndefined();
    await expect(
      provisionTenantSchema(prisma, clubId),
    ).resolves.toBeUndefined();
  });

  it("schema created by second call has the same tables as the first", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);
    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schemaName}
        AND table_type = 'BASE TABLE'
    `;
    expect(result).toHaveLength(7);
  });

  it("pgcrypto extension is available after provisioning", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'
    `;
    expect(result).toHaveLength(1);
    expect(result[0]?.["extname"]).toBe("pgcrypto");
  });

  it("can encrypt and decrypt a value in the new tenant schema (pgcrypto smoke test)", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const testKey = "smoke-test-key-that-is-32-chars!!";
    const plaintext = "12345678900";

    const [row] = await prisma.$queryRaw<[{ decrypted: string }]>`
      SELECT pgp_sym_decrypt(
        pgp_sym_encrypt(${plaintext}::text, ${testKey}::text),
        ${testKey}::text
      ) AS decrypted
    `;
    expect(row?.decrypted).toBe(plaintext);
  });

  it("creates the member_plans unique index on (memberId, planId)", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT ix.relname AS index_name
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class ix ON ix.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = ${schemaName}
        AND t.relname = 'member_plans'
        AND i.indisunique = true
        AND ix.relname = 'member_plans_memberId_planId_key'
    `;
    expect(result).toHaveLength(1);
  });

  it("creates the payments unique index on gatewayTxid", async () => {
    const clubId = makeTestClubId();
    const schemaName = `clube_${clubId}`;
    createdSchemas.push(schemaName);

    await provisionTenantSchema(prisma, clubId);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT ix.relname AS index_name
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class ix ON ix.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = ${schemaName}
        AND t.relname = 'payments'
        AND i.indisunique = true
        AND ix.relname = 'payments_gatewayTxid_key'
    `;
    expect(result).toHaveLength(1);
  });

  it("different clubIds get isolated schemas with independent tables", async () => {
    const clubIdA = makeTestClubId();
    const clubIdB = makeTestClubId();
    createdSchemas.push(`clube_${clubIdA}`, `clube_${clubIdB}`);

    await provisionTenantSchema(prisma, clubIdA);
    await provisionTenantSchema(prisma, clubIdB);

    const result = await prisma.$queryRaw<Row[]>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name IN (${`clube_${clubIdA}`}, ${`clube_${clubIdB}`})
    `;
    expect(result).toHaveLength(2);
  });


  it("throws for an empty clubId", async () => {
    await expect(provisionTenantSchema(prisma, "")).rejects.toThrow(
      /Invalid clubId format/,
    );
  });

  it("throws for a clubId with uppercase letters", async () => {
    await expect(
      provisionTenantSchema(prisma, "AAAAAAAAAAAAAAAAAAAAAAAAA"),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("throws for a clubId that contains special characters (SQL injection guard)", async () => {
    await expect(
      provisionTenantSchema(prisma, `"; DROP SCHEMA public; --`),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("throws for a clubId that is too short (< 20 chars)", async () => {
    await expect(provisionTenantSchema(prisma, "abc123")).rejects.toThrow(
      /Invalid clubId format/,
    );
  });

  it("throws for a clubId that is too long (> 30 chars)", async () => {
    await expect(provisionTenantSchema(prisma, "a".repeat(31))).rejects.toThrow(
      /Invalid clubId format/,
    );
  });
});
