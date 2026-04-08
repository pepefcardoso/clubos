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
 *   pnpm --filter api vitest run src/lib/tenant-schema.test.ts
 *
 * When DATABASE_URL is not set the entire suite is skipped automatically so
 * `pnpm test` in a local environment without a database does not fail CI.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { PrismaClient } from "../../generated/prisma/index.js";
import { provisionTenantSchema } from "./tenant-schema.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? process.env["TEST_DATABASE_URL"];

const hasDatabase = Boolean(DATABASE_URL);

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
  if (!hasDatabase) return;

  prisma = new PrismaClient({
    log: [],
    datasourceUrl: DATABASE_URL!,
  } as any);
});

const createdSchemas: string[] = [];

afterEach(async () => {
  if (!hasDatabase) return;
  for (const schema of createdSchemas.splice(0)) {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

describe("provisionTenantSchema — input validation (no DB required)", () => {
  const fakePrisma = {} as PrismaClient;

  it("throws for an empty clubId", async () => {
    await expect(provisionTenantSchema(fakePrisma, "")).rejects.toThrow(
      /Invalid clubId format/,
    );
  });

  it("throws for a clubId with uppercase letters", async () => {
    await expect(
      provisionTenantSchema(fakePrisma, "AAAAAAAAAAAAAAAAAAAAAAAAA"),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("throws for a clubId that contains special characters (SQL injection guard)", async () => {
    await expect(
      provisionTenantSchema(fakePrisma, `"; DROP SCHEMA public; --`),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("throws for a clubId that is too short (< 20 chars)", async () => {
    await expect(provisionTenantSchema(fakePrisma, "abc123")).rejects.toThrow(
      /Invalid clubId format/,
    );
  });

  it("throws for a clubId that is too long (> 30 chars)", async () => {
    await expect(
      provisionTenantSchema(fakePrisma, "a".repeat(31)),
    ).rejects.toThrow(/Invalid clubId format/);
  });
});

describe.skipIf(!hasDatabase)(
  "provisionTenantSchema — integration (requires DATABASE_URL)",
  () => {
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

    it("creates all expected tenant tables (12 total)", async () => {
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

      const tableNames = result.map(
        (r) => r["table_name"] as string,
      );
      expect(tableNames).toEqual(
        expect.arrayContaining([
          "athletes",
          "audit_log",
          "charges",
          "contracts",
          "member_plans",
          "members",
          "message_templates",
          "messages",
          "payments",
          "plans",
          "rules_config",
          "workload_metrics",
        ]),
      );
      expect(tableNames).toHaveLength(12);
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
        JOIN pg_class t  ON t.oid = i.indrelid
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
      expect(result).toHaveLength(12);
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
        JOIN pg_class t  ON t.oid = i.indrelid
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
        JOIN pg_class t  ON t.oid = i.indrelid
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

    it("creates the workload_metrics table", async () => {
      const clubId = makeTestClubId();
      const schemaName = `clube_${clubId}`;
      createdSchemas.push(schemaName);

      await provisionTenantSchema(prisma, clubId);

      const result = await prisma.$queryRaw<Row[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = ${schemaName}
          AND table_name   = 'workload_metrics'
          AND table_type   = 'BASE TABLE'
      `;
      expect(result).toHaveLength(1);
    });

    it("workload_metrics has the correct column types", async () => {
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
          AND table_name   = 'workload_metrics'
        ORDER BY ordinal_position
      `;

      const byName = Object.fromEntries(
        result.map((r: { column_name: string; [key: string]: unknown }) => [
          r.column_name,
          r,
        ]),
      );

      expect(byName["id"]?.data_type).toBe("text");
      expect(byName["id"]?.is_nullable).toBe("NO");

      expect(byName["athleteId"]?.data_type).toBe("text");
      expect(byName["athleteId"]?.is_nullable).toBe("NO");

      expect(byName["trainingSessionId"]?.data_type).toBe("text");
      expect(byName["trainingSessionId"]?.is_nullable).toBe("YES");

      expect(byName["date"]?.data_type).toBe("date");
      expect(byName["date"]?.is_nullable).toBe("NO");

      expect(byName["rpe"]?.data_type).toBe("integer");
      expect(byName["rpe"]?.is_nullable).toBe("NO");

      expect(byName["durationMinutes"]?.data_type).toBe("integer");
      expect(byName["durationMinutes"]?.is_nullable).toBe("NO");

      expect(byName["sessionType"]?.data_type).toBe("USER-DEFINED");
      expect(byName["sessionType"]?.is_nullable).toBe("NO");

      expect(byName["notes"]?.data_type).toBe("text");
      expect(byName["notes"]?.is_nullable).toBe("YES");

      expect(byName["createdAt"]?.data_type).toBe(
        "timestamp without time zone",
      );
      expect(byName["createdAt"]?.is_nullable).toBe("NO");
      expect(byName["updatedAt"]?.data_type).toBe(
        "timestamp without time zone",
      );
      expect(byName["updatedAt"]?.is_nullable).toBe("NO");
    });

    it("workload_metrics.sessionType defaults to TRAINING", async () => {
      const clubId = makeTestClubId();
      const schemaName = `clube_${clubId}`;
      createdSchemas.push(schemaName);

      await provisionTenantSchema(prisma, clubId);

      const result = await prisma.$queryRaw<{ column_default: string }[]>`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = ${schemaName}
          AND table_name   = 'workload_metrics'
          AND column_name  = 'sessionType'
      `;
      expect(result[0]?.column_default).toContain("TRAINING");
    });

    it("creates workload_metrics_date_brin_idx using BRIN access method", async () => {
      const clubId = makeTestClubId();
      const schemaName = `clube_${clubId}`;
      createdSchemas.push(schemaName);

      await provisionTenantSchema(prisma, clubId);

      const result = await prisma.$queryRaw<
        { indexname: string; indexdef: string }[]
      >`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = ${schemaName}
          AND tablename  = 'workload_metrics'
          AND indexname  = 'workload_metrics_date_brin_idx'
      `;
      expect(result).toHaveLength(1);
      expect(result[0]?.indexdef?.toLowerCase()).toContain("using brin");
    });

    it("creates workload_metrics_athleteId_idx (B-tree)", async () => {
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
          AND t.relname  = 'workload_metrics'
          AND ix.relname = 'workload_metrics_athleteId_idx'
      `;
      expect(result).toHaveLength(1);
    });

    it("creates workload_metrics_athleteId_date_idx composite (B-tree)", async () => {
      const clubId = makeTestClubId();
      const schemaName = `clube_${clubId}`;
      createdSchemas.push(schemaName);

      await provisionTenantSchema(prisma, clubId);

      const result = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = ${schemaName}
          AND tablename  = 'workload_metrics'
          AND indexname  = 'workload_metrics_athleteId_date_idx'
      `;
      expect(result).toHaveLength(1);
      expect(result[0]?.indexdef).toContain("athleteId");
      expect(result[0]?.indexdef).toContain("date");
    });

    it("does NOT create a unique index on workload_metrics.athleteId (multiple sessions per athlete allowed)", async () => {
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
          AND t.relname   = 'workload_metrics'
          AND a.attname   = 'athleteId'
          AND i.indisunique = true
      `;
      expect(result).toHaveLength(0);
    });

    it("enforces FK — inserting workload_metric with unknown athleteId throws", async () => {
      const clubId = makeTestClubId();
      const schemaName = `clube_${clubId}`;
      createdSchemas.push(schemaName);

      await provisionTenantSchema(prisma, clubId);
      await prisma.$executeRawUnsafe(
        `SET search_path TO "${schemaName}", public`,
      );

      await expect(
        prisma.$executeRaw`
          INSERT INTO "workload_metrics" (
            id, "athleteId", date, rpe, "durationMinutes", "updatedAt"
          ) VALUES (
            'fk-test-id',
            'non-existent-athlete-id',
            CURRENT_DATE,
            7,
            60,
            NOW()
          )
        `,
      ).rejects.toThrow();
    });

    it("SessionType enum has all five expected values", async () => {
      const clubId = makeTestClubId();
      const schemaName = `clube_${clubId}`;
      createdSchemas.push(schemaName);

      await provisionTenantSchema(prisma, clubId);

      const result = await prisma.$queryRaw<{ enumlabel: string }[]>`
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'SessionType'
        ORDER BY e.enumsortorder
      `;
      const labels = result.map((r: { enumlabel: string }) => r.enumlabel);
      expect(labels).toEqual(
        expect.arrayContaining([
          "MATCH",
          "TRAINING",
          "GYM",
          "RECOVERY",
          "OTHER",
        ]),
      );
      expect(labels).toHaveLength(5);
    });
  },
);
