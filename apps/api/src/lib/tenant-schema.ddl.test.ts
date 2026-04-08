import { describe, it, expect } from "vitest";
import {
  TENANT_TABLES_DDL_FOR_TESTING,
  TENANT_INDEXES_DDL_FOR_TESTING,
  TENANT_FOREIGN_KEYS_DDL_FOR_TESTING,
  TENANT_V2_TABLES_DDL_FOR_TESTING,
  TENANT_V2_INDEXES_DDL_FOR_TESTING,
  TENANT_V2_FOREIGN_KEYS_DDL_FOR_TESTING,
} from "./tenant-schema.js";

describe("TENANT_TABLES_DDL — technical_evaluations", () => {
  it("contains CREATE TABLE for technical_evaluations", () => {
    expect(TENANT_TABLES_DDL_FOR_TESTING).toContain(
      'CREATE TABLE IF NOT EXISTS "technical_evaluations"',
    );
  });

  it("declares id as TEXT NOT NULL with primary key", () => {
    const ddl = TENANT_TABLES_DDL_FOR_TESTING;
    expect(ddl).toContain('"technical_evaluations_pkey"');
  });

  it("declares athleteId as TEXT NOT NULL", () => {
    const block = extractTableBlock(
      TENANT_TABLES_DDL_FOR_TESTING,
      "technical_evaluations",
    );
    expect(block).toContain('"athleteId"  TEXT         NOT NULL');
  });

  it("declares microcycle as TEXT NOT NULL", () => {
    const block = extractTableBlock(
      TENANT_TABLES_DDL_FOR_TESTING,
      "technical_evaluations",
    );
    expect(block).toContain('"microcycle" TEXT         NOT NULL');
  });

  it("declares date as DATE NOT NULL", () => {
    const block = extractTableBlock(
      TENANT_TABLES_DDL_FOR_TESTING,
      "technical_evaluations",
    );
    expect(block).toContain('"date"       DATE         NOT NULL');
  });

  it("declares all five score columns as INTEGER NOT NULL", () => {
    const block = extractTableBlock(
      TENANT_TABLES_DDL_FOR_TESTING,
      "technical_evaluations",
    );
    expect(block).toContain('"technique"  INTEGER      NOT NULL');
    expect(block).toContain('"tactical"   INTEGER      NOT NULL');
    expect(block).toContain('"physical"   INTEGER      NOT NULL');
    expect(block).toContain('"mental"     INTEGER      NOT NULL');
    expect(block).toContain('"attitude"   INTEGER      NOT NULL');
  });

  it("declares notes as nullable TEXT", () => {
    const block = extractTableBlock(
      TENANT_TABLES_DDL_FOR_TESTING,
      "technical_evaluations",
    );
    expect(block).toContain('"notes"      TEXT');
    const notesLine = block.split("\n").find((l) => l.includes('"notes"'));
    expect(notesLine).toBeDefined();
    expect(notesLine).not.toContain("NOT NULL");
  });

  it("declares actorId as TEXT NOT NULL", () => {
    const block = extractTableBlock(
      TENANT_TABLES_DDL_FOR_TESTING,
      "technical_evaluations",
    );
    expect(block).toContain('"actorId"    TEXT         NOT NULL');
  });

  it("declares createdAt and updatedAt as TIMESTAMP(3) NOT NULL", () => {
    const block = extractTableBlock(
      TENANT_TABLES_DDL_FOR_TESTING,
      "technical_evaluations",
    );
    expect(block).toContain('"createdAt"  TIMESTAMP(3) NOT NULL');
    expect(block).toContain('"updatedAt"  TIMESTAMP(3) NOT NULL');
  });
});

describe("TENANT_INDEXES_DDL — technical_evaluations", () => {
  it("contains UNIQUE index on (athleteId, microcycle)", () => {
    expect(TENANT_INDEXES_DDL_FOR_TESTING).toContain(
      '"technical_evaluations_athleteId_microcycle_key"',
    );
  });

  it("unique (athleteId, microcycle) index uses CREATE UNIQUE INDEX IF NOT EXISTS", () => {
    const lines = TENANT_INDEXES_DDL_FOR_TESTING.split("\n");
    const indexLine = lines.find((l) =>
      l.includes('"technical_evaluations_athleteId_microcycle_key"'),
    );
    expect(indexLine).toBeDefined();
    expect(indexLine).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
  });

  it("unique (athleteId, microcycle) index covers both columns", () => {
    const block = extractIndexBlock(
      TENANT_INDEXES_DDL_FOR_TESTING,
      "technical_evaluations_athleteId_microcycle_key",
    );
    expect(block).toContain('"athleteId"');
    expect(block).toContain('"microcycle"');
  });

  it("contains athleteId index for technical_evaluations", () => {
    expect(TENANT_INDEXES_DDL_FOR_TESTING).toContain(
      '"technical_evaluations_athleteId_idx"',
    );
  });

  it("contains date index for technical_evaluations", () => {
    expect(TENANT_INDEXES_DDL_FOR_TESTING).toContain(
      '"technical_evaluations_date_idx"',
    );
  });

  it("athleteId and date indexes do NOT use UNIQUE", () => {
    const ddl = TENANT_INDEXES_DDL_FOR_TESTING;
    const athleteIdBlock = extractIndexBlock(
      ddl,
      "technical_evaluations_athleteId_idx",
    );
    expect(athleteIdBlock).not.toContain("UNIQUE");

    const dateBlock = extractIndexBlock(ddl, "technical_evaluations_date_idx");
    expect(dateBlock).not.toContain("UNIQUE");
  });

  it("athleteId and date indexes use standard B-tree (no USING clause)", () => {
    const ddl = TENANT_INDEXES_DDL_FOR_TESTING;
    const athleteIdBlock = extractIndexBlock(
      ddl,
      "technical_evaluations_athleteId_idx",
    );
    expect(athleteIdBlock).not.toContain("USING BRIN");
    expect(athleteIdBlock).not.toContain("USING HASH");
  });
});

describe("TENANT_FOREIGN_KEYS_DDL — technical_evaluations", () => {
  it("contains FK from technical_evaluations to athletes", () => {
    expect(TENANT_FOREIGN_KEYS_DDL_FOR_TESTING).toContain(
      '"technical_evaluations_athleteId_fkey"',
    );
  });

  it("FK references athletes(id)", () => {
    const block = extractFkBlock(
      TENANT_FOREIGN_KEYS_DDL_FOR_TESTING,
      "technical_evaluations_athleteId_fkey",
    );
    expect(block).toContain('REFERENCES "athletes" ("id")');
  });

  it("FK uses ON DELETE RESTRICT", () => {
    const block = extractFkBlock(
      TENANT_FOREIGN_KEYS_DDL_FOR_TESTING,
      "technical_evaluations_athleteId_fkey",
    );
    expect(block).toContain("ON DELETE RESTRICT");
  });

  it("FK uses ON UPDATE CASCADE", () => {
    const block = extractFkBlock(
      TENANT_FOREIGN_KEYS_DDL_FOR_TESTING,
      "technical_evaluations_athleteId_fkey",
    );
    expect(block).toContain("ON UPDATE CASCADE");
  });

  it("FK uses ADD CONSTRAINT IF NOT EXISTS (idempotent)", () => {
    const block = extractFkBlock(
      TENANT_FOREIGN_KEYS_DDL_FOR_TESTING,
      "technical_evaluations_athleteId_fkey",
    );
    expect(block).toContain("ADD CONSTRAINT IF NOT EXISTS");
  });
});

describe("TENANT_V2_INDEXES_DDL — medical_records.occurredAt BRIN", () => {
  it("uses BRIN access method for medical_records.occurredAt", () => {
    expect(TENANT_V2_INDEXES_DDL_FOR_TESTING).toContain(
      '"medical_records_occurredAt_brin_idx"',
    );
    const block = extractIndexBlock(
      TENANT_V2_INDEXES_DDL_FOR_TESTING,
      "medical_records_occurredAt_brin_idx",
    );
    expect(block).toContain("USING BRIN");
  });

  it("BRIN index covers the occurredAt column", () => {
    const block = extractIndexBlock(
      TENANT_V2_INDEXES_DDL_FOR_TESTING,
      "medical_records_occurredAt_brin_idx",
    );
    expect(block).toContain('"occurredAt"');
  });

  it("does NOT create a B-tree index named medical_records_occurredAt_idx (renamed to brin variant)", () => {
    expect(TENANT_V2_INDEXES_DDL_FOR_TESTING).not.toContain(
      '"medical_records_occurredAt_idx"',
    );
  });
});

describe("TENANT_V2_TABLES_DDL — medical_records encrypted columns", () => {
  it("declares clinicalNotes as nullable BYTEA", () => {
    const block = extractTableBlock(
      TENANT_V2_TABLES_DDL_FOR_TESTING,
      "medical_records",
    );
    expect(block).toContain('"clinicalNotes"    BYTEA');
    const line = block.split("\n").find((l) => l.includes('"clinicalNotes"'));
    expect(line).not.toContain("NOT NULL");
  });

  it("declares diagnosis as nullable BYTEA", () => {
    const block = extractTableBlock(
      TENANT_V2_TABLES_DDL_FOR_TESTING,
      "medical_records",
    );
    expect(block).toContain('"diagnosis"        BYTEA');
    const line = block.split("\n").find((l) => l.includes('"diagnosis"'));
    expect(line).not.toContain("NOT NULL");
  });

  it("declares treatmentDetails as nullable BYTEA", () => {
    const block = extractTableBlock(
      TENANT_V2_TABLES_DDL_FOR_TESTING,
      "medical_records",
    );
    expect(block).toContain('"treatmentDetails" BYTEA');
    const line = block
      .split("\n")
      .find((l) => l.includes('"treatmentDetails"'));
    expect(line).not.toContain("NOT NULL");
  });

  it("keeps structure as plaintext TEXT (needed for analytics)", () => {
    const block = extractTableBlock(
      TENANT_V2_TABLES_DDL_FOR_TESTING,
      "medical_records",
    );
    expect(block).toMatch(/"structure"\s+TEXT\s+NOT NULL/);
  });

  it("keeps grade as InjuryGrade enum (needed for analytics)", () => {
    const block = extractTableBlock(
      TENANT_V2_TABLES_DDL_FOR_TESTING,
      "medical_records",
    );
    expect(block).toContain('"InjuryGrade"');
  });

  it("keeps mechanism as InjuryMechanism enum (needed for analytics)", () => {
    const block = extractTableBlock(
      TENANT_V2_TABLES_DDL_FOR_TESTING,
      "medical_records",
    );
    expect(block).toContain('"InjuryMechanism"');
  });
});

describe("TENANT_V2_INDEXES_DDL — return_to_play", () => {
  it("uses CREATE UNIQUE INDEX for return_to_play.athleteId", () => {
    const block = extractIndexBlock(
      TENANT_V2_INDEXES_DDL_FOR_TESTING,
      "return_to_play_athleteId_key",
    );
    expect(block).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
  });
});

describe("TENANT_V2_FOREIGN_KEYS_DDL — data_access_log LGPD safety", () => {
  it("does NOT add a FK from data_access_log to medical_records", () => {
    const suspectCalls = TENANT_V2_FOREIGN_KEYS_DDL_FOR_TESTING.split(
      "\n",
    ).filter(
      (l) =>
        l.toLowerCase().includes("data_access_log") &&
        l.toLowerCase().includes("foreign key") &&
        l.toLowerCase().includes("medical_records"),
    );
    expect(suspectCalls).toHaveLength(0);
  });
});

describe("Idempotency — IF NOT EXISTS on all CREATE statements", () => {
  it("all CREATE TABLE statements in TENANT_TABLES_DDL use IF NOT EXISTS", () => {
    const creates = TENANT_TABLES_DDL_FOR_TESTING.match(
      /CREATE TABLE\s+(?!IF NOT EXISTS)/gi,
    );
    expect(creates).toBeNull();
  });

  it("all CREATE TABLE statements in TENANT_V2_TABLES_DDL use IF NOT EXISTS", () => {
    const creates = TENANT_V2_TABLES_DDL_FOR_TESTING.match(
      /CREATE TABLE\s+(?!IF NOT EXISTS)/gi,
    );
    expect(creates).toBeNull();
  });

  it("all CREATE INDEX statements in TENANT_INDEXES_DDL use IF NOT EXISTS", () => {
    const creates = TENANT_INDEXES_DDL_FOR_TESTING.match(
      /CREATE (?:UNIQUE )?INDEX\s+(?!IF NOT EXISTS)/gi,
    );
    expect(creates).toBeNull();
  });

  it("all CREATE INDEX statements in TENANT_V2_INDEXES_DDL use IF NOT EXISTS", () => {
    const creates = TENANT_V2_INDEXES_DDL_FOR_TESTING.match(
      /CREATE (?:UNIQUE )?INDEX\s+(?!IF NOT EXISTS)/gi,
    );
    expect(creates).toBeNull();
  });

  it("all ADD CONSTRAINT statements in TENANT_FOREIGN_KEYS_DDL use IF NOT EXISTS", () => {
    const adds = TENANT_FOREIGN_KEYS_DDL_FOR_TESTING.match(
      /ADD CONSTRAINT\s+(?!IF NOT EXISTS)/gi,
    );
    expect(adds).toBeNull();
  });

  it("all ADD CONSTRAINT statements in TENANT_V2_FOREIGN_KEYS_DDL use IF NOT EXISTS", () => {
    const adds = TENANT_V2_FOREIGN_KEYS_DDL_FOR_TESTING.match(
      /ADD CONSTRAINT\s+(?!IF NOT EXISTS)/gi,
    );
    expect(adds).toBeNull();
  });
});

describe("Exported DDL constants are non-empty strings", () => {
  const constants = [
    ["TENANT_TABLES_DDL_FOR_TESTING", TENANT_TABLES_DDL_FOR_TESTING],
    ["TENANT_INDEXES_DDL_FOR_TESTING", TENANT_INDEXES_DDL_FOR_TESTING],
    [
      "TENANT_FOREIGN_KEYS_DDL_FOR_TESTING",
      TENANT_FOREIGN_KEYS_DDL_FOR_TESTING,
    ],
    ["TENANT_V2_TABLES_DDL_FOR_TESTING", TENANT_V2_TABLES_DDL_FOR_TESTING],
    ["TENANT_V2_INDEXES_DDL_FOR_TESTING", TENANT_V2_INDEXES_DDL_FOR_TESTING],
    [
      "TENANT_V2_FOREIGN_KEYS_DDL_FOR_TESTING",
      TENANT_V2_FOREIGN_KEYS_DDL_FOR_TESTING,
    ],
  ] as const;

  for (const [name, value] of constants) {
    it(`${name} is a non-empty string`, () => {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    });
  }
});

/**
 * Extracts the CREATE TABLE block for a given table name from a DDL string.
 * Returns the text from `CREATE TABLE IF NOT EXISTS "tableName"` up to the
 * matching closing `);`.
 */
function extractTableBlock(ddl: string, tableName: string): string {
  const startPattern = `CREATE TABLE IF NOT EXISTS "${tableName}"`;
  const startIdx = ddl.indexOf(startPattern);
  if (startIdx === -1) return "";

  let depth = 0;
  let endIdx = startIdx;
  let found = false;

  for (let i = startIdx; i < ddl.length; i++) {
    if (ddl[i] === "(") {
      depth++;
      found = true;
    } else if (ddl[i] === ")") {
      depth--;
      if (found && depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  return ddl.slice(startIdx, endIdx);
}

/**
 * Extracts the CREATE INDEX block for a given index name from a DDL string.
 * Returns the text from the CREATE INDEX line up to the terminating semicolon.
 */
function extractIndexBlock(ddl: string, indexName: string): string {
  const idx = ddl.indexOf(`"${indexName}"`);
  if (idx === -1) return "";

  const lineStart = ddl.lastIndexOf("\n", idx);
  const stmtStart = ddl.lastIndexOf("CREATE", idx);
  const start = Math.max(lineStart, stmtStart);

  const end = ddl.indexOf(";", idx);
  return ddl.slice(start, end + 1);
}

/**
 * Extracts the ALTER TABLE ... ADD CONSTRAINT block for a given constraint name.
 * Returns text from the ALTER TABLE line up to the terminating semicolon.
 */
function extractFkBlock(ddl: string, constraintName: string): string {
  const idx = ddl.indexOf(`"${constraintName}"`);
  if (idx === -1) return "";

  const alterStart = ddl.lastIndexOf("ALTER TABLE", idx);
  const end = ddl.indexOf(";", idx);
  return ddl.slice(alterStart, end + 1);
}
