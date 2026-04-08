/**
 * Unit tests for src/lib/seed-injury-protocols.ts
 *
 * All tests run offline — no DATABASE_URL required. The PrismaClient is mocked
 * so we can assert exact call counts, template string content, and interpolated
 * argument values without touching a real database.
 *
 * Key design notes that tests encode:
 *   - seedInjuryProtocols() routes through withTenantSchema → prisma.$transaction
 *   - Each of the 6 FIFA protocols triggers exactly one tx.$executeRaw call
 *   - Inserts use the safer tagged $executeRaw (parameterised), never $executeRawUnsafe
 *   - ON CONFLICT ("id") DO NOTHING guarantees idempotency at the DB level
 *   - steps are passed as JSON.stringify'd strings cast to ::jsonb
 *   - grade is passed as a raw string cast to ::"InjuryGrade" in the template literal
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedInjuryProtocols } from "./seed-injury-protocols.js";
import { PrismaClient } from "../../generated/prisma/index.js";

function makeMockPrisma(): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $executeRaw: vi.fn().mockResolvedValue(1n),
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";

/**
 * The number of protocols in the FIFA_PROTOCOLS constant inside the module.
 * Update this when T-121 expands the library.
 */
const PROTOCOL_COUNT = 6;

/**
 * Expected protocol IDs — must exactly match the `id` field of each entry
 * in FIFA_PROTOCOLS. Update when T-121 adds more protocols.
 */
const EXPECTED_IDS = [
  "proto_hamstring_g1",
  "proto_hamstring_g2",
  "proto_hamstring_g3",
  "proto_ankle_lateral_g1",
  "proto_ankle_lateral_g2",
  "proto_quad_g1",
] as const;

type ExecuteRawCall = [TemplateStringsArray, ...unknown[]];

function getTemplateStrings(call: ExecuteRawCall): string {
  return (call[0] as TemplateStringsArray).join("");
}

function getProtocolId(call: ExecuteRawCall): string {
  return call[1] as string;
}

function getName(call: ExecuteRawCall): string {
  return call[2] as string;
}

function getStructure(call: ExecuteRawCall): string {
  return call[3] as string;
}

function getGrade(call: ExecuteRawCall): string {
  return call[4] as string;
}

function getStepsJson(call: ExecuteRawCall): string {
  return call[5] as string;
}

function getSource(call: ExecuteRawCall): string {
  return call[6] as string;
}

function getDurationDays(call: ExecuteRawCall): number {
  return call[7] as number;
}

describe("seedInjuryProtocols()", () => {
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
  });

  it("resolves to undefined", async () => {
    await expect(seedInjuryProtocols(prisma, CLUB_ID)).resolves.toBeUndefined();
  });

  it("calls $transaction exactly once via withTenantSchema", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it(`calls $executeRaw exactly ${PROTOCOL_COUNT} times — one INSERT per protocol`, async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(PROTOCOL_COUNT);
  });

  it("sets search_path to the correct tenant schema via $executeRawUnsafe", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`clube_${CLUB_ID}`),
    );
  });

  it("does not use $executeRawUnsafe for the INSERT statements (SQL injection safety)", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const unsafeCalls = vi.mocked(prisma.$executeRawUnsafe).mock.calls;
    const insertCalls = unsafeCalls.filter(
      (args) =>
        typeof args[0] === "string" && args[0].toUpperCase().includes("INSERT"),
    );
    expect(insertCalls).toHaveLength(0);
  });

  it("every INSERT targets the injury_protocols table", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      expect(getTemplateStrings(call)).toContain('"injury_protocols"');
    }
  });

  it('every INSERT contains ON CONFLICT ("id") DO NOTHING', async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      expect(getTemplateStrings(call)).toContain(
        'ON CONFLICT ("id") DO NOTHING',
      );
    }
  });

  it('every INSERT casts grade to "InjuryGrade" enum', async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      expect(getTemplateStrings(call)).toContain('::"InjuryGrade"');
    }
  });

  it("every INSERT casts steps to ::jsonb", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      expect(getTemplateStrings(call)).toContain("::jsonb");
    }
  });

  it("every INSERT includes the isActive column set to true", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      expect(getTemplateStrings(call)).toContain('"isActive"');
      expect(getTemplateStrings(call)).toContain("true");
    }
  });

  it("every INSERT includes createdAt and updatedAt via NOW()", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      const strings = getTemplateStrings(call);
      expect(strings).toContain('"createdAt"');
      expect(strings).toContain('"updatedAt"');
      expect(strings).toContain("NOW()");
    }
  });

  it("all expected protocol IDs appear as interpolated values", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    const ids = calls.map(getProtocolId);
    for (const expectedId of EXPECTED_IDS) {
      expect(ids).toContain(expectedId);
    }
  });

  it("each protocol ID appears exactly once (no duplicates)", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    const ids = calls.map(getProtocolId);
    const unique = new Set(ids);
    expect(unique.size).toBe(PROTOCOL_COUNT);
  });

  it("all three anatomical structures (Hamstring, Ankle, Quadriceps) are seeded", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    const structures = calls.map(getStructure);
    expect(structures).toContain("Hamstring");
    expect(structures).toContain("Ankle");
    expect(structures).toContain("Quadriceps");
  });

  it("all three grades (GRADE_1, GRADE_2, GRADE_3) are seeded", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    const grades = calls.map(getGrade);
    expect(grades).toContain("GRADE_1");
    expect(grades).toContain("GRADE_2");
    expect(grades).toContain("GRADE_3");
  });

  it("no grade value outside the InjuryGrade enum is passed", async () => {
    const validGrades = new Set(["GRADE_1", "GRADE_2", "GRADE_3", "COMPLETE"]);
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      expect(validGrades.has(getGrade(call))).toBe(true);
    }
  });

  it("every protocol uses FIFA Medical 2023 as source", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      expect(getSource(call)).toBe("FIFA Medical 2023");
    }
  });

  it("all durationDays values are positive integers", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      const days = getDurationDays(call);
      expect(typeof days).toBe("number");
      expect(Number.isInteger(days)).toBe(true);
      expect(days).toBeGreaterThan(0);
    }
  });

  it("protocol names are non-empty strings", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      const name = getName(call);
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("steps are passed as a JSON string (serialised for ::jsonb cast)", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      const stepsArg = getStepsJson(call);
      expect(typeof stepsArg).toBe("string");
      const parsed: unknown = JSON.parse(stepsArg);
      expect(Array.isArray(parsed)).toBe(true);
    }
  });

  it("every steps array contains at least one step object", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      const steps = JSON.parse(getStepsJson(call)) as unknown[];
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  it("every step object has at least day and activity keys", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    for (const call of calls) {
      const steps = JSON.parse(getStepsJson(call)) as Record<string, unknown>[];
      for (const step of steps) {
        expect(step).toHaveProperty("day");
        expect(step).toHaveProperty("activity");
        expect(typeof step["day"]).toBe("string");
        expect(typeof step["activity"]).toBe("string");
      }
    }
  });

  it("all three Hamstring protocols cover grades I, II, and III", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    const hamstringGrades = calls
      .filter((c) => getStructure(c) === "Hamstring")
      .map(getGrade);
    expect(hamstringGrades).toContain("GRADE_1");
    expect(hamstringGrades).toContain("GRADE_2");
    expect(hamstringGrades).toContain("GRADE_3");
  });

  it("Hamstring Grade III has the longest durationDays among all protocols", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];
    const g3Duration = calls
      .filter(
        (c) => getStructure(c) === "Hamstring" && getGrade(c) === "GRADE_3",
      )
      .map(getDurationDays)[0];
    const allDurations = calls.map(getDurationDays);
    expect(g3Duration).toBe(Math.max(...allDurations));
  });

  it("Grade I protocols are shorter than Grade II protocols for the same structure", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const calls = vi.mocked(prisma.$executeRaw).mock.calls as ExecuteRawCall[];

    const hamG1 = calls.find(
      (c) => getStructure(c) === "Hamstring" && getGrade(c) === "GRADE_1",
    );
    const hamG2 = calls.find(
      (c) => getStructure(c) === "Hamstring" && getGrade(c) === "GRADE_2",
    );
    expect(getDurationDays(hamG1!)).toBeLessThan(getDurationDays(hamG2!));

    const ankleG1 = calls.find(
      (c) => getStructure(c) === "Ankle" && getGrade(c) === "GRADE_1",
    );
    const ankleG2 = calls.find(
      (c) => getStructure(c) === "Ankle" && getGrade(c) === "GRADE_2",
    );
    expect(getDurationDays(ankleG1!)).toBeLessThan(getDurationDays(ankleG2!));
  });

  it("can be called twice on the same club without throwing", async () => {
    await expect(seedInjuryProtocols(prisma, CLUB_ID)).resolves.toBeUndefined();
    await expect(seedInjuryProtocols(prisma, CLUB_ID)).resolves.toBeUndefined();
  });

  it("second call makes the same number of $executeRaw calls as the first", async () => {
    await seedInjuryProtocols(prisma, CLUB_ID);
    const firstCount = vi.mocked(prisma.$executeRaw).mock.calls.length;

    await seedInjuryProtocols(prisma, CLUB_ID);
    const totalCount = vi.mocked(prisma.$executeRaw).mock.calls.length;

    expect(totalCount - firstCount).toBe(firstCount);
  });

  it("can be called for two different clubIds without interference", async () => {
    const prismaA = makeMockPrisma();
    const prismaB = makeMockPrisma();
    const clubIdA = "testclubid0000000001";
    const clubIdB = "testclubid0000000002";

    await expect(
      seedInjuryProtocols(prismaA, clubIdA),
    ).resolves.toBeUndefined();
    await expect(
      seedInjuryProtocols(prismaB, clubIdB),
    ).resolves.toBeUndefined();

    expect(prismaA.$executeRaw).toHaveBeenCalledTimes(PROTOCOL_COUNT);
    expect(prismaB.$executeRaw).toHaveBeenCalledTimes(PROTOCOL_COUNT);
  });

  it("propagates $executeRaw errors (e.g. pgcrypto not installed)", async () => {
    vi.mocked(prisma.$executeRaw).mockRejectedValueOnce(
      new Error("function pgp_sym_encrypt(text, text) does not exist"),
    );
    await expect(seedInjuryProtocols(prisma, CLUB_ID)).rejects.toThrow(
      "pgp_sym_encrypt",
    );
  });

  it("propagates $transaction errors from withTenantSchema", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(
      new Error("transaction aborted"),
    );
    await expect(seedInjuryProtocols(prisma, CLUB_ID)).rejects.toThrow(
      "transaction aborted",
    );
  });

  it("stops inserting after the first $executeRaw failure (no partial success masking)", async () => {
    vi.mocked(prisma.$executeRaw)
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error("disk full"));

    await expect(seedInjuryProtocols(prisma, CLUB_ID)).rejects.toThrow(
      "disk full",
    );

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
