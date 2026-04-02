import { describe, it, expect } from "vitest";
import { tryoutFormSchema, getAgeFromBirthDate } from "./tryout.schema";

function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns a birth date that is exactly `years` old as of tomorrow —
 * meaning the person has NOT yet had their birthday this year.
 */
function isoYearsAgoPlusOneDayInFuture(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const ADULT_BIRTH = isoYearsAgo(20);
const MINOR_BIRTH = isoYearsAgo(15);

const BASE_ADULT = {
  clubSlug: "ec-alvarenga",
  athleteName: "João Silva",
  birthDate: ADULT_BIRTH,
  phone: "11999990000",
};

const BASE_MINOR = { ...BASE_ADULT, birthDate: MINOR_BIRTH };

const VALID_GUARDIAN = {
  guardianName: "Maria Silva",
  guardianPhone: "11988880000",
  guardianRelationship: "mae" as const,
};

describe("tryoutFormSchema — adult athlete", () => {
  it("accepts a valid adult submission without guardian fields", () => {
    expect(tryoutFormSchema.safeParse(BASE_ADULT).success).toBe(true);
  });

  it("accepts optional email and position for adult", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      email: "joao@email.com",
      position: "Atacante",
      notes: "Disponível às terças e quintas.",
    });
    expect(result.success).toBe(true);
  });

  it("ignores guardian fields when supplied for an adult (not required, not blocked)", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      ...VALID_GUARDIAN,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects phone with fewer than 10 digits", () => {
    const result = tryoutFormSchema.safeParse({ ...BASE_ADULT, phone: "123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors["phone"]).toBeDefined();
    }
  });

  it("rejects phone with letters", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      phone: "1199abc0000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts 10-digit phone (landline)", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      phone: "1133334444",
    });
    expect(result.success).toBe(true);
  });
});

describe("tryoutFormSchema — minor athlete", () => {
  it("rejects a minor submission with no guardian fields", () => {
    const result = tryoutFormSchema.safeParse(BASE_MINOR);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("guardianName");
      expect(paths).toContain("guardianPhone");
      expect(paths).toContain("guardianRelationship");
    }
  });

  it("rejects a minor submission missing only guardianName", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_MINOR,
      guardianPhone: VALID_GUARDIAN.guardianPhone,
      guardianRelationship: VALID_GUARDIAN.guardianRelationship,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "guardianName"),
      ).toBe(true);
    }
  });

  it("rejects a minor submission missing only guardianRelationship", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_MINOR,
      guardianName: VALID_GUARDIAN.guardianName,
      guardianPhone: VALID_GUARDIAN.guardianPhone,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "guardianRelationship"),
      ).toBe(true);
    }
  });

  it("accepts a fully valid minor submission with all guardian fields", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_MINOR,
      ...VALID_GUARDIAN,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all guardian relationship enum values", () => {
    const relationships = ["mae", "pai", "avo", "tio", "outro"] as const;
    for (const rel of relationships) {
      const result = tryoutFormSchema.safeParse({
        ...BASE_MINOR,
        ...VALID_GUARDIAN,
        guardianRelationship: rel,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid guardian relationship value", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_MINOR,
      ...VALID_GUARDIAN,
      guardianRelationship: "irma",
    });
    expect(result.success).toBe(false);
  });
});

describe("tryoutFormSchema — birth date", () => {
  it("rejects non-ISO date format", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      birthDate: "20/06/1995",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a birth date too far in the past (> 35 years)", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      birthDate: isoYearsAgo(36),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a birth date too recent (< 5 years)", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      birthDate: isoYearsAgo(3),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a birth date at exactly the 35-year boundary", () => {
    const result = tryoutFormSchema.safeParse({
      ...BASE_ADULT,
      birthDate: isoYearsAgo(35),
    });
    expect(result.success).toBe(true);
  });
});

describe("getAgeFromBirthDate()", () => {
  it("returns correct age for a fixed date in the past", () => {
    const birth = `${new Date().getFullYear() - 20}-01-01`;
    const age = getAgeFromBirthDate(birth);
    expect(age).toBeGreaterThanOrEqual(19);
    expect(age).toBeLessThanOrEqual(20);
  });

  it("returns 0 for someone born today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(getAgeFromBirthDate(today)).toBe(0);
  });

  it("does not yet count the birthday if it is tomorrow", () => {
    const birth = isoYearsAgoPlusOneDayInFuture(18);
    const age = getAgeFromBirthDate(birth);
    expect(age).toBe(17);
  });

  it("counts the birthday on the exact day", () => {
    const birth = isoYearsAgo(18);
    const age = getAgeFromBirthDate(birth);
    expect(age).toBe(18);
  });

  it("returns null for an empty string", () => {
    expect(getAgeFromBirthDate("")).toBeNull();
  });

  it("returns null for a non-date string", () => {
    expect(getAgeFromBirthDate("not-a-date")).toBeNull();
  });

  it("returns null for a partial date", () => {
    expect(getAgeFromBirthDate("2005-06")).toBeNull();
  });

  it("returns null for an impossible date (Feb 30)", () => {
    expect(getAgeFromBirthDate("2000-02-30")).toBeNull();
  });
});
