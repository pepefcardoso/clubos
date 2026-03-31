import { describe, it, expect } from "vitest";
import { normalizeHealthKitPayload } from "../adapters/healthkit.adapter.js";
import { normalizeGoogleFitPayload } from "../adapters/googlefit.adapter.js";

const HK_BASE = {
  workoutActivityType: "HKWorkoutActivityTypeSoccer",
  duration: 3600,
  startDate: "2024-06-01T09:00:00.000Z",
  endDate: "2024-06-01T10:00:00.000Z",
  athleteId: "athlete_001",
  rpe: 7,
};

describe("normalizeHealthKitPayload", () => {
  it("converts duration seconds to minutes", () => {
    const result = normalizeHealthKitPayload({ ...HK_BASE, duration: 3600 });
    expect(result.durationMinutes).toBe(60);
  });

  it("rounds fractional minutes up to at least 1", () => {
    const result = normalizeHealthKitPayload({ ...HK_BASE, duration: 30 });
    expect(result.durationMinutes).toBe(1);
  });

  it("rounds 90 seconds to 2 minutes", () => {
    const result = normalizeHealthKitPayload({ ...HK_BASE, duration: 90 });
    expect(result.durationMinutes).toBe(2);
  });

  it("maps HKWorkoutActivityTypeSoccer to TRAINING", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      workoutActivityType: "HKWorkoutActivityTypeSoccer",
    });
    expect(result.sessionType).toBe("TRAINING");
  });

  it("maps HKWorkoutActivityTypeRunning to TRAINING", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      workoutActivityType: "HKWorkoutActivityTypeRunning",
    });
    expect(result.sessionType).toBe("TRAINING");
  });

  it("maps HKWorkoutActivityTypeTraditionalStrengthTraining to GYM", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      workoutActivityType: "HKWorkoutActivityTypeTraditionalStrengthTraining",
    });
    expect(result.sessionType).toBe("GYM");
  });

  it("maps HKWorkoutActivityTypeFunctionalStrengthTraining to GYM", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      workoutActivityType: "HKWorkoutActivityTypeFunctionalStrengthTraining",
    });
    expect(result.sessionType).toBe("GYM");
  });

  it("maps HKWorkoutActivityTypeCooldown to RECOVERY", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      workoutActivityType: "HKWorkoutActivityTypeCooldown",
    });
    expect(result.sessionType).toBe("RECOVERY");
  });

  it("maps HKWorkoutActivityTypeFlexibility to RECOVERY", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      workoutActivityType: "HKWorkoutActivityTypeFlexibility",
    });
    expect(result.sessionType).toBe("RECOVERY");
  });

  it("falls back to OTHER for unknown activity type", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      workoutActivityType: "HKWorkoutActivityTypeUnknownType",
    });
    expect(result.sessionType).toBe("OTHER");
  });

  it("extracts date as YYYY-MM-DD from startDate ISO string", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      startDate: "2024-08-15T14:30:00.000Z",
    });
    expect(result.date).toBe("2024-08-15");
  });

  it("preserves athleteId", () => {
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      athleteId: "ath-xyz-123",
    });
    expect(result.athleteId).toBe("ath-xyz-123");
  });

  it("preserves rpe", () => {
    const result = normalizeHealthKitPayload({ ...HK_BASE, rpe: 9 });
    expect(result.rpe).toBe(9);
  });

  it("sets sourceProvider to healthkit", () => {
    const result = normalizeHealthKitPayload(HK_BASE);
    expect(result.sourceProvider).toBe("healthkit");
  });

  it("passes idempotencyKey through when present", () => {
    const key = "aabbccddeeff00112233445566778899";
    const result = normalizeHealthKitPayload({
      ...HK_BASE,
      idempotencyKey: key,
    });
    expect(result.idempotencyKey).toBe(key);
  });

  it("idempotencyKey is undefined when not provided", () => {
    const result = normalizeHealthKitPayload(HK_BASE);
    expect(result.idempotencyKey).toBeUndefined();
  });
});

const GFIT_BASE = {
  activityType: 93,
  durationMillis: 5_400_000,
  startTimeMillis: new Date("2024-06-01T09:00:00.000Z").getTime(),
  athleteId: "athlete_001",
  rpe: 7,
};

describe("normalizeGoogleFitPayload", () => {
  it("converts duration milliseconds to minutes", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      durationMillis: 5_400_000,
    });
    expect(result.durationMinutes).toBe(90);
  });

  it("rounds fractional minutes, minimum 1", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      durationMillis: 10_000,
    });
    expect(result.durationMinutes).toBe(1);
  });

  it("converts 60 000 ms to 1 minute exactly", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      durationMillis: 60_000,
    });
    expect(result.durationMinutes).toBe(1);
  });

  it("maps activity type 93 (Soccer) to TRAINING", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      activityType: 93,
    });
    expect(result.sessionType).toBe("TRAINING");
  });

  it("maps activity type 72 (Running) to TRAINING", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      activityType: 72,
    });
    expect(result.sessionType).toBe("TRAINING");
  });

  it("maps activity type 26 (Circuit training) to GYM", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      activityType: 26,
    });
    expect(result.sessionType).toBe("GYM");
  });

  it("maps activity type 63 (Pilates) to RECOVERY", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      activityType: 63,
    });
    expect(result.sessionType).toBe("RECOVERY");
  });

  it("maps activity type 80 (Stretching) to RECOVERY", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      activityType: 80,
    });
    expect(result.sessionType).toBe("RECOVERY");
  });

  it("falls back to OTHER for unmapped activity type", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      activityType: 9999,
    });
    expect(result.sessionType).toBe("OTHER");
  });

  it("extracts date as YYYY-MM-DD from startTimeMillis", () => {
    const millis = new Date("2024-09-20T08:00:00.000Z").getTime();
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      startTimeMillis: millis,
    });
    expect(result.date).toBe("2024-09-20");
  });

  it("preserves athleteId", () => {
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      athleteId: "ath-fit-007",
    });
    expect(result.athleteId).toBe("ath-fit-007");
  });

  it("preserves rpe", () => {
    const result = normalizeGoogleFitPayload({ ...GFIT_BASE, rpe: 5 });
    expect(result.rpe).toBe(5);
  });

  it("sets sourceProvider to google_fit", () => {
    const result = normalizeGoogleFitPayload(GFIT_BASE);
    expect(result.sourceProvider).toBe("google_fit");
  });

  it("passes idempotencyKey through when present", () => {
    const key = "aabbccddeeff00112233445566778899";
    const result = normalizeGoogleFitPayload({
      ...GFIT_BASE,
      idempotencyKey: key,
    });
    expect(result.idempotencyKey).toBe(key);
  });

  it("idempotencyKey is undefined when not provided", () => {
    const result = normalizeGoogleFitPayload(GFIT_BASE);
    expect(result.idempotencyKey).toBeUndefined();
  });
});
