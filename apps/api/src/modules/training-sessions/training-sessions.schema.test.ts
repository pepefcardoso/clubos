import { describe, it, expect } from "vitest";
import {
  CreateTrainingSessionSchema,
  UpdateTrainingSessionSchema,
  ListTrainingSessionsQuerySchema,
  AddSessionExerciseSchema,
} from "./training-sessions.schema.js";

describe("AddSessionExerciseSchema", () => {
  const valid = { exerciseId: "exercise_001" };

  it("accepts a minimal valid payload", () => {
    expect(AddSessionExerciseSchema.safeParse(valid).success).toBe(true);
  });

  it("applies default order of 0", () => {
    const result = AddSessionExerciseSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.order).toBe(0);
  });

  it("rejects empty exerciseId", () => {
    expect(AddSessionExerciseSchema.safeParse({ exerciseId: "" }).success).toBe(
      false,
    );
  });

  it("rejects negative order", () => {
    expect(
      AddSessionExerciseSchema.safeParse({ exerciseId: "x", order: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects non-positive sets", () => {
    expect(
      AddSessionExerciseSchema.safeParse({ exerciseId: "x", sets: 0 }).success,
    ).toBe(false);
  });

  it("accepts all optional prescription fields together", () => {
    const result = AddSessionExerciseSchema.safeParse({
      exerciseId: "e1",
      order: 2,
      sets: 3,
      reps: 10,
      durationSeconds: 30,
      notes: "Rest 60s",
    });
    expect(result.success).toBe(true);
  });
});

describe("CreateTrainingSessionSchema", () => {
  const valid = {
    title: "Treino de Força",
    scheduledAt: "2025-06-01T09:00:00.000Z",
    durationMinutes: 90,
  };

  it("accepts a minimal valid payload", () => {
    expect(CreateTrainingSessionSchema.safeParse(valid).success).toBe(true);
  });

  it("applies default sessionType of TRAINING", () => {
    const result = CreateTrainingSessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sessionType).toBe("TRAINING");
  });

  it("applies default exercises array of []", () => {
    const result = CreateTrainingSessionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.exercises).toEqual([]);
  });

  it("rejects title shorter than 2 characters", () => {
    expect(
      CreateTrainingSessionSchema.safeParse({ ...valid, title: "X" }).success,
    ).toBe(false);
  });

  it("rejects title longer than 200 characters", () => {
    expect(
      CreateTrainingSessionSchema.safeParse({
        ...valid,
        title: "A".repeat(201),
      }).success,
    ).toBe(false);
  });

  it("rejects invalid ISO 8601 scheduledAt", () => {
    const result = CreateTrainingSessionSchema.safeParse({
      ...valid,
      scheduledAt: "01/06/2025",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toMatch(/ISO 8601/);
  });

  it("rejects durationMinutes of 0", () => {
    expect(
      CreateTrainingSessionSchema.safeParse({ ...valid, durationMinutes: 0 })
        .success,
    ).toBe(false);
  });

  it("rejects durationMinutes > 480", () => {
    expect(
      CreateTrainingSessionSchema.safeParse({ ...valid, durationMinutes: 481 })
        .success,
    ).toBe(false);
  });

  it("accepts durationMinutes of 480", () => {
    expect(
      CreateTrainingSessionSchema.safeParse({ ...valid, durationMinutes: 480 })
        .success,
    ).toBe(true);
  });

  it("rejects exercises array with more than 50 items", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      exerciseId: `e${i}`,
    }));
    expect(
      CreateTrainingSessionSchema.safeParse({ ...valid, exercises: tooMany })
        .success,
    ).toBe(false);
  });

  it("accepts all valid sessionType values", () => {
    const types = ["MATCH", "TRAINING", "GYM", "RECOVERY", "OTHER"] as const;
    for (const sessionType of types) {
      expect(
        CreateTrainingSessionSchema.safeParse({ ...valid, sessionType })
          .success,
      ).toBe(true);
    }
  });

  it("strips unknown fields", () => {
    const result = CreateTrainingSessionSchema.safeParse({
      ...valid,
      clubId: "nope",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("clubId");
  });
});

describe("UpdateTrainingSessionSchema", () => {
  it("accepts an empty object — no fields required", () => {
    expect(UpdateTrainingSessionSchema.safeParse({}).success).toBe(true);
  });

  it("accepts isCompleted: true (mark session done)", () => {
    expect(
      UpdateTrainingSessionSchema.safeParse({ isCompleted: true }).success,
    ).toBe(true);
  });

  it("accepts notes: null (clears the field)", () => {
    const result = UpdateTrainingSessionSchema.safeParse({ notes: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBeNull();
  });

  it("rejects invalid sessionType", () => {
    expect(
      UpdateTrainingSessionSchema.safeParse({ sessionType: "YOGA" }).success,
    ).toBe(false);
  });

  it("rejects durationMinutes > 480", () => {
    expect(
      UpdateTrainingSessionSchema.safeParse({ durationMinutes: 500 }).success,
    ).toBe(false);
  });

  it("rejects invalid scheduledAt datetime string", () => {
    expect(
      UpdateTrainingSessionSchema.safeParse({ scheduledAt: "not-a-date" })
        .success,
    ).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = UpdateTrainingSessionSchema.safeParse({
      title: "Updated",
      foo: "bar",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("foo");
  });
});

describe("ListTrainingSessionsQuerySchema", () => {
  it("applies defaults when no params are given", () => {
    const result = ListTrainingSessionsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces page and limit from strings", () => {
    const result = ListTrainingSessionsQuerySchema.safeParse({
      page: "3",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("coerces isCompleted from string 'true'", () => {
    const result = ListTrainingSessionsQuerySchema.safeParse({
      isCompleted: "true",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isCompleted).toBe(true);
  });

  it("rejects limit > 100", () => {
    expect(
      ListTrainingSessionsQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
  });

  it("accepts from/to date range filters in YYYY-MM-DD format", () => {
    const result = ListTrainingSessionsQuerySchema.safeParse({
      from: "2025-06-01",
      to: "2025-06-30",
    });
    expect(result.success).toBe(true);
  });

  it("rejects from date in non-ISO format", () => {
    expect(
      ListTrainingSessionsQuerySchema.safeParse({ from: "01/06/2025" }).success,
    ).toBe(false);
  });

  it("accepts valid sessionType filter", () => {
    expect(
      ListTrainingSessionsQuerySchema.safeParse({ sessionType: "MATCH" })
        .success,
    ).toBe(true);
  });

  it("rejects invalid sessionType filter", () => {
    expect(
      ListTrainingSessionsQuerySchema.safeParse({ sessionType: "YOGA" })
        .success,
    ).toBe(false);
  });
});
