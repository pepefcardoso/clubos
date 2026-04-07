/**
 * Unit tests for the v2.0 DDL additions in src/lib/tenant-schema.ts.
 *
 * Strategy: mock PrismaClient with a call recorder so we can assert which
 * SQL blocks are applied, without requiring a live PostgreSQL instance.
 * Integration tests (real DB) live in tenant-schema.test.ts and
 * tenant-schema.contracts.test.ts.
 *
 * All tests are offline-safe — no DATABASE_URL needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { provisionTenantSchema } from "./tenant-schema.js";

type SqlCall = string;

function makeMockPrisma() {
  const calls: SqlCall[] = [];

  const mock = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      calls.push(sql);
    }),
    $transaction: vi.fn(async (fn: (tx: typeof mock) => Promise<void>) => {
      await fn(mock);
    }),
    _calls: calls,
  };

  return mock;
}

type MockPrisma = ReturnType<typeof makeMockPrisma>;

/** Returns true if any SQL call contains the given substring. */
function anySqlContains(calls: SqlCall[], fragment: string): boolean {
  return calls.some((sql) => sql.includes(fragment));
}

/** Returns all SQL calls that contain the given substring. */
function sqlCallsWith(calls: SqlCall[], fragment: string): SqlCall[] {
  return calls.filter((sql) => sql.includes(fragment));
}

const VALID_CLUB_ID = "testclubid0000000001";

let prisma: MockPrisma;

beforeEach(() => {
  prisma = makeMockPrisma();
});

describe("provisionTenantSchema — input validation", () => {
  it("throws for an empty clubId", async () => {
    await expect(provisionTenantSchema(prisma as never, "")).rejects.toThrow(
      /Invalid clubId format/,
    );
  });

  it("throws for a clubId with uppercase letters", async () => {
    await expect(
      provisionTenantSchema(prisma as never, "AAAAAAAAAAAAAAAAAAAAAAAAA"),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("throws for a clubId with special characters (SQL injection guard)", async () => {
    await expect(
      provisionTenantSchema(prisma as never, `"; DROP SCHEMA public; --`),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("throws for a clubId shorter than 20 chars", async () => {
    await expect(
      provisionTenantSchema(prisma as never, "abc123"),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("throws for a clubId longer than 30 chars", async () => {
    await expect(
      provisionTenantSchema(prisma as never, "a".repeat(31)),
    ).rejects.toThrow(/Invalid clubId format/);
  });

  it("does not call $executeRawUnsafe when validation fails", async () => {
    await expect(
      provisionTenantSchema(prisma as never, "bad"),
    ).rejects.toThrow();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("provisionTenantSchema — execution order", () => {
  it("calls $executeRawUnsafe with pgcrypto DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(anySqlContains(prisma._calls, "pgcrypto")).toBe(true);
  });

  it("creates the tenant schema with the correct name", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(
        prisma._calls,
        `CREATE SCHEMA IF NOT EXISTS "clube_${VALID_CLUB_ID}"`,
      ),
    ).toBe(true);
  });

  it("sets search_path to the tenant schema before enum DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(
        prisma._calls,
        `SET search_path TO "clube_${VALID_CLUB_ID}", public`,
      ),
    ).toBe(true);
  });

  it("calls $transaction exactly once", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("provisionTenantSchema — v1 tables present (regression guard)", () => {
  it("includes members table DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, 'CREATE TABLE IF NOT EXISTS "members"'),
    ).toBe(true);
  });

  it("includes athletes table DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, 'CREATE TABLE IF NOT EXISTS "athletes"'),
    ).toBe(true);
  });

  it("includes workload_metrics table DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(
        prisma._calls,
        'CREATE TABLE IF NOT EXISTS "workload_metrics"',
      ),
    ).toBe(true);
  });

  it("includes acwr_aggregates materialized view DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(anySqlContains(prisma._calls, "acwr_aggregates")).toBe(true);
  });

  it("includes balance_sheets table DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(
        prisma._calls,
        'CREATE TABLE IF NOT EXISTS "balance_sheets"',
      ),
    ).toBe(true);
  });
});

describe("provisionTenantSchema — v2.0 enums", () => {
  it("creates RtpStatus enum with all three values", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const enumCalls = sqlCallsWith(prisma._calls, "RtpStatus");
    expect(enumCalls.length).toBeGreaterThan(0);
    const combined = enumCalls.join("\n");
    expect(combined).toContain("AFASTADO");
    expect(combined).toContain("RETORNO_PROGRESSIVO");
    expect(combined).toContain("LIBERADO");
  });

  it("creates InjuryGrade enum with all four values", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const enumCalls = sqlCallsWith(prisma._calls, "InjuryGrade");
    expect(enumCalls.length).toBeGreaterThan(0);
    const combined = enumCalls.join("\n");
    expect(combined).toContain("GRADE_1");
    expect(combined).toContain("GRADE_2");
    expect(combined).toContain("GRADE_3");
    expect(combined).toContain("COMPLETE");
  });

  it("creates InjuryMechanism enum with all four values", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const enumCalls = sqlCallsWith(prisma._calls, "InjuryMechanism");
    expect(enumCalls.length).toBeGreaterThan(0);
    const combined = enumCalls.join("\n");
    expect(combined).toContain("CONTACT");
    expect(combined).toContain("NON_CONTACT");
    expect(combined).toContain("OVERUSE");
    expect(combined).toContain("UNKNOWN");
  });
});

describe("provisionTenantSchema — v2.0 AuditAction extensions", () => {
  const expectedActions = [
    "MEDICAL_RECORD_CREATED",
    "MEDICAL_RECORD_UPDATED",
    "MEDICAL_RECORD_ACCESSED",
    "RTP_STATUS_CHANGED",
    "CREDITOR_DISCLOSURE_CREATED",
    "CREDITOR_DISCLOSURE_UPDATED",
    "FIELD_ACCESS_LOGGED",
  ];

  for (const action of expectedActions) {
    it(`adds AuditAction value '${action}' with IF NOT EXISTS`, async () => {
      await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
      expect(anySqlContains(prisma._calls, `'${action}'`)).toBe(true);
      const calls = sqlCallsWith(prisma._calls, `'${action}'`);
      expect(calls.some((sql) => sql.includes("ADD VALUE IF NOT EXISTS"))).toBe(
        true,
      );
    });
  }
});

describe("provisionTenantSchema — v2.0 tables present", () => {
  const expectedTables = [
    "injury_protocols",
    "medical_records",
    "return_to_play",
    "data_access_log",
    "creditor_disclosures",
    "field_access_logs",
  ];

  for (const table of expectedTables) {
    it(`creates table "${table}"`, async () => {
      await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
      expect(
        anySqlContains(prisma._calls, `CREATE TABLE IF NOT EXISTS "${table}"`),
      ).toBe(true);
    });
  }
});

describe("provisionTenantSchema — clinical field encryption (BYTEA)", () => {
  it("declares clinicalNotes as BYTEA in medical_records DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const medicalDdl = sqlCallsWith(prisma._calls, '"medical_records"');
    const combined = medicalDdl.join("\n");
    expect(combined).toContain('"clinicalNotes"');
    expect(combined).toContain("BYTEA");
  });

  it("declares diagnosis as BYTEA in medical_records DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const medicalDdl = sqlCallsWith(prisma._calls, '"medical_records"');
    const combined = medicalDdl.join("\n");
    expect(combined).toContain('"diagnosis"');
    expect(combined).toContain("BYTEA");
  });

  it("declares treatmentDetails as BYTEA in medical_records DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const medicalDdl = sqlCallsWith(prisma._calls, '"medical_records"');
    const combined = medicalDdl.join("\n");
    expect(combined).toContain('"treatmentDetails"');
    expect(combined).toContain("BYTEA");
  });

  it("keeps structure, grade, and mechanism as non-BYTEA (needed for analytics queries)", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const medicalDdl = sqlCallsWith(prisma._calls, '"medical_records"');
    const combined = medicalDdl.join("\n");
    expect(combined).toMatch(/"structure"\s+TEXT/);
    expect(combined).toContain('"InjuryGrade"');
    expect(combined).toContain('"InjuryMechanism"');
  });
});

describe("provisionTenantSchema — v2.0 indexes", () => {
  it("creates a UNIQUE index on return_to_play.athleteId", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, '"return_to_play_athleteId_key"'),
    ).toBe(true);
    const indexCalls = sqlCallsWith(
      prisma._calls,
      '"return_to_play_athleteId_key"',
    );
    expect(indexCalls.some((sql) => sql.includes("UNIQUE INDEX"))).toBe(true);
  });

  it("creates a BRIN index on data_access_log.createdAt", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, '"data_access_log_createdAt_brin_idx"'),
    ).toBe(true);
    const indexCalls = sqlCallsWith(
      prisma._calls,
      '"data_access_log_createdAt_brin_idx"',
    );
    expect(indexCalls.some((sql) => sql.includes("USING BRIN"))).toBe(true);
  });

  it("creates a BRIN index on field_access_logs.scannedAt", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, '"field_access_logs_scannedAt_brin_idx"'),
    ).toBe(true);
    const indexCalls = sqlCallsWith(
      prisma._calls,
      '"field_access_logs_scannedAt_brin_idx"',
    );
    expect(indexCalls.some((sql) => sql.includes("USING BRIN"))).toBe(true);
  });

  it("creates a partial unique index on field_access_logs.idempotencyKey (WHERE NOT NULL)", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const indexCalls = sqlCallsWith(
      prisma._calls,
      '"field_access_logs_idempotencyKey_key"',
    );
    expect(indexCalls.length).toBeGreaterThan(0);
    expect(indexCalls.some((sql) => sql.includes("WHERE"))).toBe(true);
    expect(indexCalls.some((sql) => sql.includes("IS NOT NULL"))).toBe(true);
  });

  it("creates an index on medical_records.athleteId", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, '"medical_records_athleteId_idx"'),
    ).toBe(true);
  });

  it("creates an index on creditor_disclosures.dueDate", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, '"creditor_disclosures_dueDate_idx"'),
    ).toBe(true);
  });
});

describe("provisionTenantSchema — v2.0 foreign keys", () => {
  it("adds FK from medical_records to athletes", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, '"medical_records_athleteId_fkey"'),
    ).toBe(true);
  });

  it("adds nullable FK from medical_records to injury_protocols with ON DELETE SET NULL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const fkCalls = sqlCallsWith(
      prisma._calls,
      '"medical_records_protocolId_fkey"',
    );
    expect(fkCalls.length).toBeGreaterThan(0);
    expect(fkCalls.some((sql) => sql.includes("ON DELETE SET NULL"))).toBe(
      true,
    );
  });

  it("adds FK from return_to_play to athletes", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    expect(
      anySqlContains(prisma._calls, '"return_to_play_athleteId_fkey"'),
    ).toBe(true);
  });

  it("adds nullable FK from return_to_play to medical_records with ON DELETE SET NULL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const fkCalls = sqlCallsWith(
      prisma._calls,
      '"return_to_play_medicalRecordId_fkey"',
    );
    expect(fkCalls.length).toBeGreaterThan(0);
    expect(fkCalls.some((sql) => sql.includes("ON DELETE SET NULL"))).toBe(
      true,
    );
  });

  it("adds nullable FK from return_to_play to injury_protocols with ON DELETE SET NULL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const fkCalls = sqlCallsWith(
      prisma._calls,
      '"return_to_play_protocolId_fkey"',
    );
    expect(fkCalls.length).toBeGreaterThan(0);
    expect(fkCalls.some((sql) => sql.includes("ON DELETE SET NULL"))).toBe(
      true,
    );
  });

  it("does NOT add a FK from data_access_log to medical_records (intentional — LGPD purge safety)", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const suspectCalls = prisma._calls.filter(
      (sql) =>
        sql.includes("data_access_log") &&
        sql.includes("FOREIGN KEY") &&
        sql.includes("medical_records"),
    );
    expect(suspectCalls).toHaveLength(0);
  });
});

describe("provisionTenantSchema — idempotency", () => {
  it("uses IF NOT EXISTS on all v2 table DDL", async () => {
    await provisionTenantSchema(prisma as never, VALID_CLUB_ID);
    const v2TableCalls = [
      "injury_protocols",
      "medical_records",
      "return_to_play",
      "data_access_log",
      "creditor_disclosures",
      "field_access_logs",
    ].flatMap((table) => sqlCallsWith(prisma._calls, `"${table}"`));

    for (const call of v2TableCalls) {
      if (call.includes("CREATE TABLE")) {
        expect(call).toContain("IF NOT EXISTS");
      }
    }
  });

  it("can be called twice without throwing (mock-level idempotency contract)", async () => {
    await expect(
      provisionTenantSchema(prisma as never, VALID_CLUB_ID),
    ).resolves.toBeUndefined();

    prisma = makeMockPrisma();

    await expect(
      provisionTenantSchema(prisma as never, VALID_CLUB_ID),
    ).resolves.toBeUndefined();
  });
});

describe("provisionTenantSchema — schema name derivation", () => {
  it("uses clube_{clubId} as the schema name in all SET search_path calls", async () => {
    const clubId = "abcdef1234567890abcd";
    prisma = makeMockPrisma();
    await provisionTenantSchema(prisma as never, clubId);

    const searchPathCalls = sqlCallsWith(prisma._calls, "SET search_path");
    expect(searchPathCalls.length).toBeGreaterThan(0);
    for (const call of searchPathCalls) {
      expect(call).toContain(`clube_${clubId}`);
    }
  });

  it("uses the schema-qualified name in the CREATE SCHEMA call", async () => {
    const clubId = "abcdef1234567890abcd";
    prisma = makeMockPrisma();
    await provisionTenantSchema(prisma as never, clubId);
    expect(
      anySqlContains(
        prisma._calls,
        `CREATE SCHEMA IF NOT EXISTS "clube_${clubId}"`,
      ),
    ).toBe(true);
  });
});
