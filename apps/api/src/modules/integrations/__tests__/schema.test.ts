import { describe, it, expect } from "vitest";
import {
  CreateIntegrationTokenSchema,
  NormalizedWorkloadPayloadSchema,
  HealthKitPayloadSchema,
  GoogleFitPayloadSchema,
} from "../integrations.schema.js";

describe("CreateIntegrationTokenSchema", () => {
  const valid = { athleteId: "ath-001", label: "Apple Watch" };

  it("accepts a valid input", () => {
    expect(CreateIntegrationTokenSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty athleteId", () => {
    expect(
      CreateIntegrationTokenSchema.safeParse({ ...valid, athleteId: "" })
        .success,
    ).toBe(false);
  });

  it("rejects label shorter than 2 chars", () => {
    expect(
      CreateIntegrationTokenSchema.safeParse({ ...valid, label: "A" }).success,
    ).toBe(false);
  });

  it("rejects label longer than 100 chars", () => {
    expect(
      CreateIntegrationTokenSchema.safeParse({
        ...valid,
        label: "A".repeat(101),
      }).success,
    ).toBe(false);
  });

  it("accepts label of exactly 2 chars", () => {
    expect(
      CreateIntegrationTokenSchema.safeParse({ ...valid, label: "AB" }).success,
    ).toBe(true);
  });

  it("accepts label of exactly 100 chars", () => {
    expect(
      CreateIntegrationTokenSchema.safeParse({
        ...valid,
        label: "A".repeat(100),
      }).success,
    ).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = CreateIntegrationTokenSchema.safeParse({
      ...valid,
      unknown: "field",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>)["unknown"],
      ).toBeUndefined();
    }
  });
});

describe("NormalizedWorkloadPayloadSchema", () => {
  const valid = {
    athleteId: "ath-001",
    date: "2024-06-01",
    rpe: 7,
    durationMinutes: 60,
  };

  it("accepts a valid minimal input", () => {
    expect(NormalizedWorkloadPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults sessionType to TRAINING", () => {
    const result = NormalizedWorkloadPayloadSchema.safeParse(valid);
    expect(result.success && result.data.sessionType).toBe("TRAINING");
  });

  it("defaults sourceProvider to unknown", () => {
    const result = NormalizedWorkloadPayloadSchema.safeParse(valid);
    expect(result.success && result.data.sourceProvider).toBe("unknown");
  });

  it("accepts all valid sessionType values", () => {
    for (const type of ["MATCH", "TRAINING", "GYM", "RECOVERY", "OTHER"]) {
      expect(
        NormalizedWorkloadPayloadSchema.safeParse({
          ...valid,
          sessionType: type,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects rpe = 0 (below minimum)", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({ ...valid, rpe: 0 }).success,
    ).toBe(false);
  });

  it("rejects rpe = 11 (above maximum)", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({ ...valid, rpe: 11 }).success,
    ).toBe(false);
  });

  it("accepts rpe = 1 (minimum)", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({ ...valid, rpe: 1 }).success,
    ).toBe(true);
  });

  it("accepts rpe = 10 (maximum)", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({ ...valid, rpe: 10 }).success,
    ).toBe(true);
  });

  it("rejects durationMinutes = 0", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({
        ...valid,
        durationMinutes: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects durationMinutes > 480", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({
        ...valid,
        durationMinutes: 481,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({
        ...valid,
        date: "01/06/2024",
      }).success,
    ).toBe(false);
  });

  it("accepts a valid 32-char hex idempotencyKey", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({
        ...valid,
        idempotencyKey: "aabbccddeeff00112233445566778899",
      }).success,
    ).toBe(true);
  });

  it("rejects an idempotencyKey that is not 32 lowercase hex chars", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({
        ...valid,
        idempotencyKey: "AABBCCDDEEFF001122334455",
      }).success,
    ).toBe(false);
  });

  it("accepts notes up to 500 chars", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({
        ...valid,
        notes: "A".repeat(500),
      }).success,
    ).toBe(true);
  });

  it("rejects notes over 500 chars", () => {
    expect(
      NormalizedWorkloadPayloadSchema.safeParse({
        ...valid,
        notes: "A".repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe("HealthKitPayloadSchema", () => {
  const valid = {
    workoutActivityType: "HKWorkoutActivityTypeSoccer",
    duration: 3600,
    startDate: "2024-06-01T09:00:00.000Z",
    endDate: "2024-06-01T10:00:00.000Z",
    athleteId: "ath-001",
    rpe: 7,
  };

  it("accepts a valid minimal input", () => {
    expect(HealthKitPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional totalEnergyBurned", () => {
    expect(
      HealthKitPayloadSchema.safeParse({
        ...valid,
        totalEnergyBurned: 450,
      }).success,
    ).toBe(true);
  });

  it("accepts optional metadata", () => {
    expect(
      HealthKitPayloadSchema.safeParse({
        ...valid,
        metadata: { HKAverageMETs: 9.5 },
      }).success,
    ).toBe(true);
  });

  it("rejects rpe = 0", () => {
    expect(HealthKitPayloadSchema.safeParse({ ...valid, rpe: 0 }).success).toBe(
      false,
    );
  });

  it("rejects rpe = 11", () => {
    expect(
      HealthKitPayloadSchema.safeParse({ ...valid, rpe: 11 }).success,
    ).toBe(false);
  });

  it("rejects non-positive duration", () => {
    expect(
      HealthKitPayloadSchema.safeParse({ ...valid, duration: 0 }).success,
    ).toBe(false);
  });

  it("rejects non-datetime startDate", () => {
    expect(
      HealthKitPayloadSchema.safeParse({
        ...valid,
        startDate: "2024-06-01",
      }).success,
    ).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = HealthKitPayloadSchema.safeParse({ ...valid, extra: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)["extra"]).toBeUndefined();
    }
  });
});

describe("GoogleFitPayloadSchema", () => {
  const valid = {
    activityType: 93,
    durationMillis: 5_400_000,
    startTimeMillis: 1717228800000,
    athleteId: "ath-001",
    rpe: 7,
  };

  it("accepts a valid minimal input", () => {
    expect(GoogleFitPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional calories", () => {
    expect(
      GoogleFitPayloadSchema.safeParse({ ...valid, calories: 600 }).success,
    ).toBe(true);
  });

  it("rejects rpe = 0", () => {
    expect(GoogleFitPayloadSchema.safeParse({ ...valid, rpe: 0 }).success).toBe(
      false,
    );
  });

  it("rejects rpe = 11", () => {
    expect(
      GoogleFitPayloadSchema.safeParse({ ...valid, rpe: 11 }).success,
    ).toBe(false);
  });

  it("rejects non-positive durationMillis", () => {
    expect(
      GoogleFitPayloadSchema.safeParse({ ...valid, durationMillis: 0 }).success,
    ).toBe(false);
  });

  it("rejects non-integer activityType", () => {
    expect(
      GoogleFitPayloadSchema.safeParse({ ...valid, activityType: 72.5 })
        .success,
    ).toBe(false);
  });

  it("accepts a valid idempotencyKey", () => {
    expect(
      GoogleFitPayloadSchema.safeParse({
        ...valid,
        idempotencyKey: "aabbccddeeff00112233445566778899",
      }).success,
    ).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = GoogleFitPayloadSchema.safeParse({ ...valid, extra: "x" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>)["extra"]).toBeUndefined();
    }
  });
});
