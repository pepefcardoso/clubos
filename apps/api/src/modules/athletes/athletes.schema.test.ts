import { describe, it, expect } from "vitest";
import {
  CreateAthleteSchema,
  UpdateAthleteSchema,
  ListAthletesQuerySchema,
} from "./athletes.schema.js";

describe("CreateAthleteSchema", () => {
  const valid = {
    name: "João Silva",
    cpf: "12345678901",
    birthDate: "1990-05-15",
  };

  it("accepts a minimal valid payload", () => {
    const result = CreateAthleteSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts optional fields: position", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      position: "Goleiro",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.position).toBe("Goleiro");
  });

  it("rejects name shorter than 2 characters", () => {
    const result = CreateAthleteSchema.safeParse({ ...valid, name: "J" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 120 characters", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      name: "A".repeat(121),
    });
    expect(result.success).toBe(false);
  });

  it("rejects CPF with fewer than 11 digits", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      cpf: "1234567890",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toMatch(/11 digits/);
  });

  it("rejects CPF with more than 11 digits", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      cpf: "123456789012",
    });
    expect(result.success).toBe(false);
  });

  it("rejects CPF containing non-digit characters", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      cpf: "123.456.789-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects birthDate in wrong format (not YYYY-MM-DD)", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      birthDate: "15/05/1990",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toMatch(/YYYY-MM-DD/);
  });

  it("rejects birthDate as ISO datetime string (time component present)", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      birthDate: "1990-05-15T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects position longer than 60 characters", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      position: "A".repeat(61),
    });
    expect(result.success).toBe(false);
  });

  it("allows position of exactly 60 characters", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      position: "A".repeat(60),
    });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = CreateAthleteSchema.safeParse({
      ...valid,
      clubId: "should-be-stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("clubId");
  });
});

describe("UpdateAthleteSchema", () => {
  it("accepts an empty object (no fields required)", () => {
    expect(UpdateAthleteSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial update with only name", () => {
    const result = UpdateAthleteSchema.safeParse({ name: "Maria Souza" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Maria Souza");
  });

  it("accepts status values ACTIVE, INACTIVE, SUSPENDED", () => {
    for (const status of ["ACTIVE", "INACTIVE", "SUSPENDED"] as const) {
      const result = UpdateAthleteSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid status value", () => {
    const result = UpdateAthleteSchema.safeParse({ status: "OVERDUE" });
    expect(result.success).toBe(false);
  });

  it("accepts position: null (clears the field)", () => {
    const result = UpdateAthleteSchema.safeParse({ position: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.position).toBeNull();
  });

  it("rejects position longer than 60 characters", () => {
    const result = UpdateAthleteSchema.safeParse({
      position: "A".repeat(61),
    });
    expect(result.success).toBe(false);
  });

  it("rejects birthDate in wrong format", () => {
    const result = UpdateAthleteSchema.safeParse({
      birthDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid birthDate update", () => {
    const result = UpdateAthleteSchema.safeParse({ birthDate: "2000-12-31" });
    expect(result.success).toBe(true);
  });

  it("does not include cpf — CPF is immutable", () => {
    const result = UpdateAthleteSchema.safeParse({ cpf: "12345678901" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("cpf");
  });
});

describe("ListAthletesQuerySchema", () => {
  it("applies defaults when no params are given", () => {
    const result = ListAthletesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces page and limit from strings (query-string style)", () => {
    const result = ListAthletesQuerySchema.safeParse({
      page: "2",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects page < 1", () => {
    expect(ListAthletesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejects limit < 1", () => {
    expect(ListAthletesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("rejects limit > 100", () => {
    expect(ListAthletesQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
  });

  it("accepts limit of exactly 100", () => {
    expect(ListAthletesQuerySchema.safeParse({ limit: 100 }).success).toBe(
      true,
    );
  });

  it("accepts valid status filters", () => {
    for (const status of ["ACTIVE", "INACTIVE", "SUSPENDED"] as const) {
      const result = ListAthletesQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects an invalid status filter", () => {
    expect(
      ListAthletesQuerySchema.safeParse({ status: "DELETED" }).success,
    ).toBe(false);
  });

  it("accepts an optional search string", () => {
    const result = ListAthletesQuerySchema.safeParse({ search: "joão" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.search).toBe("joão");
  });
});
