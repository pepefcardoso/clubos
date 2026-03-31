import { describe, it, expect } from "vitest";
import {
  CreateExerciseSchema,
  UpdateExerciseSchema,
  ListExercisesQuerySchema,
} from "./exercises.schema.js";

describe("CreateExerciseSchema", () => {
  const valid = { name: "Supino Reto", category: "STRENGTH" as const };

  it("accepts a minimal valid payload", () => {
    expect(CreateExerciseSchema.safeParse(valid).success).toBe(true);
  });

  it("applies default category of OTHER when omitted", () => {
    const result = CreateExerciseSchema.safeParse({ name: "Corrida" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe("OTHER");
  });

  it("applies default muscleGroups of [] when omitted", () => {
    const result = CreateExerciseSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.muscleGroups).toEqual([]);
  });

  it("accepts all valid category values", () => {
    const categories = [
      "STRENGTH",
      "CARDIO",
      "TECHNICAL",
      "TACTICAL",
      "RECOVERY",
      "OTHER",
    ] as const;
    for (const category of categories) {
      expect(
        CreateExerciseSchema.safeParse({ name: "X", category }).success,
      ).toBe(true);
    }
  });

  it("rejects name shorter than 2 characters", () => {
    expect(CreateExerciseSchema.safeParse({ name: "X" }).success).toBe(false);
  });

  it("rejects name longer than 120 characters", () => {
    expect(
      CreateExerciseSchema.safeParse({ name: "A".repeat(121) }).success,
    ).toBe(false);
  });

  it("rejects an invalid category value", () => {
    expect(
      CreateExerciseSchema.safeParse({ name: "Test", category: "YOGA" })
        .success,
    ).toBe(false);
  });

  it("rejects muscleGroups with more than 10 items", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `muscle${i}`);
    expect(
      CreateExerciseSchema.safeParse({ name: "Test", muscleGroups: tooMany })
        .success,
    ).toBe(false);
  });

  it("rejects a muscleGroup entry longer than 60 characters", () => {
    expect(
      CreateExerciseSchema.safeParse({
        name: "Test",
        muscleGroups: ["A".repeat(61)],
      }).success,
    ).toBe(false);
  });

  it("rejects description longer than 1000 characters", () => {
    expect(
      CreateExerciseSchema.safeParse({
        name: "Test",
        description: "A".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = CreateExerciseSchema.safeParse({
      name: "Test",
      clubId: "should-be-stripped",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("clubId");
  });
});

describe("UpdateExerciseSchema", () => {
  it("accepts an empty object — no fields required", () => {
    expect(UpdateExerciseSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial update with only name", () => {
    const result = UpdateExerciseSchema.safeParse({ name: "Pull-up" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Pull-up");
  });

  it("accepts isActive: false (soft restore/hide)", () => {
    const result = UpdateExerciseSchema.safeParse({ isActive: false });
    expect(result.success).toBe(true);
  });

  it("accepts description: null (clears the field)", () => {
    const result = UpdateExerciseSchema.safeParse({ description: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });

  it("rejects an invalid category", () => {
    expect(UpdateExerciseSchema.safeParse({ category: "YOGA" }).success).toBe(
      false,
    );
  });

  it("rejects name shorter than 2 characters", () => {
    expect(UpdateExerciseSchema.safeParse({ name: "X" }).success).toBe(false);
  });

  it("rejects muscleGroups with more than 10 items", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `m${i}`);
    expect(
      UpdateExerciseSchema.safeParse({ muscleGroups: tooMany }).success,
    ).toBe(false);
  });

  it("strips unknown fields such as clubId", () => {
    const result = UpdateExerciseSchema.safeParse({
      name: "X-Y",
      extra: "nope",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("extra");
  });
});

describe("ListExercisesQuerySchema", () => {
  it("applies defaults when no params are given", () => {
    const result = ListExercisesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.includeInactive).toBe(false);
    }
  });

  it("coerces page and limit from strings", () => {
    const result = ListExercisesQuerySchema.safeParse({
      page: "2",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it("coerces includeInactive from string 'true'", () => {
    const result = ListExercisesQuerySchema.safeParse({
      includeInactive: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.includeInactive).toBe(true);
  });

  it("rejects page < 1", () => {
    expect(ListExercisesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejects limit < 1", () => {
    expect(ListExercisesQuerySchema.safeParse({ limit: 0 }).success).toBe(
      false,
    );
  });

  it("rejects limit > 100", () => {
    expect(ListExercisesQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
  });

  it("accepts limit of exactly 100", () => {
    expect(ListExercisesQuerySchema.safeParse({ limit: 100 }).success).toBe(
      true,
    );
  });

  it("accepts valid category filter", () => {
    const result = ListExercisesQuerySchema.safeParse({ category: "CARDIO" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid category filter", () => {
    expect(
      ListExercisesQuerySchema.safeParse({ category: "YOGA" }).success,
    ).toBe(false);
  });

  it("accepts optional search string", () => {
    const result = ListExercisesQuerySchema.safeParse({
      search: "agachamento",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.search).toBe("agachamento");
  });
});
