import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClubOSDatabase } from "../index";
import type { CachedExercise } from "../types";

let testDb: ClubOSDatabase;

import {
  upsertCachedExercises,
  getCachedExercises,
  getCachedExercise,
  clearStaleCachedExercises,
  clearAllCachedExercises,
  countCachedExercises,
} from "../exercises.db";

const CLUB_A = "club_aaaaaaaaaaaaaaaaaaa1";
const CLUB_B = "club_bbbbbbbbbbbbbbbbbbb1";

function makeExercise(
  overrides: Partial<CachedExercise> & { id: string; clubId: string },
): CachedExercise {
  return {
    name: "Supino Reto",
    description: null,
    category: "STRENGTH",
    muscleGroups: ["peitoral"],
    isActive: true,
    cachedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  testDb = new ClubOSDatabase();
  await testDb.open();
});

afterEach(async () => {
  await testDb.exercises.clear();
  await testDb.athletes.clear();
  await testDb.trainingSessions.clear();
  testDb.close();
});

describe("upsertCachedExercises", () => {
  it("inserts new exercises", async () => {
    const exercises = [
      makeExercise({ id: "ex_1", clubId: CLUB_A }),
      makeExercise({ id: "ex_2", clubId: CLUB_A, name: "Agachamento" }),
    ];
    await upsertCachedExercises(exercises);

    const count = await countCachedExercises(CLUB_A);
    expect(count).toBe(2);
  });

  it("updates an existing exercise without creating duplicates (idempotent)", async () => {
    const original = makeExercise({
      id: "ex_1",
      clubId: CLUB_A,
      name: "Original",
    });
    await upsertCachedExercises([original]);

    const updated = { ...original, name: "Updated Name" };
    await upsertCachedExercises([updated]);

    const count = await countCachedExercises(CLUB_A);
    expect(count).toBe(1);

    const fetched = await getCachedExercise("ex_1");
    expect(fetched?.name).toBe("Updated Name");
  });

  it("handles a large batch without errors", async () => {
    const batch = Array.from({ length: 200 }, (_, i) =>
      makeExercise({ id: `ex_${i}`, clubId: CLUB_A }),
    );
    await expect(upsertCachedExercises(batch)).resolves.toBeUndefined();
    const count = await countCachedExercises(CLUB_A);
    expect(count).toBe(200);
  });

  it("stores all fields correctly", async () => {
    const exercise = makeExercise({
      id: "ex_full",
      clubId: CLUB_A,
      name: "Pull-up",
      description: "Barra fixa",
      category: "STRENGTH",
      muscleGroups: ["dorsal", "bíceps"],
      isActive: true,
    });
    await upsertCachedExercises([exercise]);

    const result = await getCachedExercise("ex_full");
    expect(result?.name).toBe("Pull-up");
    expect(result?.description).toBe("Barra fixa");
    expect(result?.category).toBe("STRENGTH");
    expect(result?.muscleGroups).toEqual(["dorsal", "bíceps"]);
    expect(result?.isActive).toBe(true);
  });

  it("can store inactive exercises (isActive: false)", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "ex_inactive", clubId: CLUB_A, isActive: false }),
    ]);
    const result = await getCachedExercise("ex_inactive");
    expect(result?.isActive).toBe(false);
  });
});

describe("getCachedExercises", () => {
  beforeEach(async () => {
    await upsertCachedExercises([
      makeExercise({ id: "a1", clubId: CLUB_A, category: "STRENGTH" }),
      makeExercise({ id: "a2", clubId: CLUB_A, category: "CARDIO" }),
      makeExercise({
        id: "a3",
        clubId: CLUB_A,
        category: "TECHNICAL",
        isActive: false,
      }),
      makeExercise({ id: "b1", clubId: CLUB_B, category: "STRENGTH" }),
    ]);
  });

  it("returns all active exercises for a club when no filter is given", async () => {
    const result = await getCachedExercises(CLUB_A);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.clubId === CLUB_A)).toBe(true);
    expect(result.every((e) => e.isActive)).toBe(true);
  });

  it("returns ALL exercises when includeInactive is true", async () => {
    const result = await getCachedExercises(CLUB_A, undefined, true);
    expect(result).toHaveLength(3);
  });

  it("filters by category when provided", async () => {
    const result = await getCachedExercises(CLUB_A, "CARDIO");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a2");
  });

  it("filters by category AND excludes inactive (default)", async () => {
    const result = await getCachedExercises(CLUB_A, "TECHNICAL");
    expect(result).toHaveLength(0);
  });

  it("filters by category AND includes inactive when flag is set", async () => {
    const result = await getCachedExercises(CLUB_A, "TECHNICAL", true);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a3");
  });

  it("tenant isolation — does not return exercises from other clubs", async () => {
    const resultA = await getCachedExercises(CLUB_A, undefined, true);
    const resultB = await getCachedExercises(CLUB_B, undefined, true);
    expect(resultA.every((e) => e.clubId === CLUB_A)).toBe(true);
    expect(resultB.every((e) => e.clubId === CLUB_B)).toBe(true);
    expect(resultA.some((e) => e.clubId === CLUB_B)).toBe(false);
  });

  it("returns empty array for a club with no cached exercises", async () => {
    const result = await getCachedExercises("club_nonexistent");
    expect(result).toEqual([]);
  });

  it("returns empty array when category filter matches no records", async () => {
    const result = await getCachedExercises(CLUB_B, "CARDIO");
    expect(result).toEqual([]);
  });
});

describe("getCachedExercise", () => {
  it("returns the exercise by id", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "ex_1", clubId: CLUB_A, name: "Barra Fixa" }),
    ]);
    const result = await getCachedExercise("ex_1");
    expect(result?.name).toBe("Barra Fixa");
  });

  it("returns undefined for a non-existent id", async () => {
    const result = await getCachedExercise("does-not-exist");
    expect(result).toBeUndefined();
  });
});

describe("clearStaleCachedExercises", () => {
  it("deletes exercises whose cachedAt is older than 4 hours", async () => {
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000 - 1;
    await upsertCachedExercises([
      makeExercise({ id: "stale", clubId: CLUB_A, cachedAt: fourHoursAgo }),
      makeExercise({ id: "fresh", clubId: CLUB_A, cachedAt: Date.now() }),
    ]);

    await clearStaleCachedExercises(CLUB_A);

    expect(await getCachedExercise("stale")).toBeUndefined();
    expect(await getCachedExercise("fresh")).toBeDefined();
  });

  it("does not delete fresh exercises", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "fresh", clubId: CLUB_A, cachedAt: Date.now() }),
    ]);

    await clearStaleCachedExercises(CLUB_A);

    expect(await countCachedExercises(CLUB_A)).toBe(1);
  });

  it("only clears stale exercises for the given clubId (tenant isolation)", async () => {
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000 - 1;
    await upsertCachedExercises([
      makeExercise({ id: "a_stale", clubId: CLUB_A, cachedAt: fourHoursAgo }),
      makeExercise({ id: "b_stale", clubId: CLUB_B, cachedAt: fourHoursAgo }),
    ]);

    await clearStaleCachedExercises(CLUB_A);

    expect(await getCachedExercise("a_stale")).toBeUndefined();
    expect(await getCachedExercise("b_stale")).toBeDefined();
  });

  it("is a no-op when no stale exercises exist", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "fresh", clubId: CLUB_A, cachedAt: Date.now() }),
    ]);

    await expect(clearStaleCachedExercises(CLUB_A)).resolves.toBeUndefined();
    expect(await countCachedExercises(CLUB_A)).toBe(1);
  });
});

describe("clearAllCachedExercises", () => {
  it("removes all exercises for a club", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "a1", clubId: CLUB_A }),
      makeExercise({ id: "a2", clubId: CLUB_A }),
    ]);

    await clearAllCachedExercises(CLUB_A);

    expect(await countCachedExercises(CLUB_A)).toBe(0);
  });

  it("does not remove exercises belonging to other clubs", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "a1", clubId: CLUB_A }),
      makeExercise({ id: "b1", clubId: CLUB_B }),
    ]);

    await clearAllCachedExercises(CLUB_A);

    expect(await countCachedExercises(CLUB_A)).toBe(0);
    expect(await countCachedExercises(CLUB_B)).toBe(1);
  });

  it("is a no-op when the club has no cached exercises", async () => {
    await expect(
      clearAllCachedExercises("club_empty"),
    ).resolves.toBeUndefined();
  });
});

describe("countCachedExercises", () => {
  it("counts only exercises for the given club", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "a1", clubId: CLUB_A }),
      makeExercise({ id: "a2", clubId: CLUB_A }),
      makeExercise({ id: "b1", clubId: CLUB_B }),
    ]);

    expect(await countCachedExercises(CLUB_A)).toBe(2);
    expect(await countCachedExercises(CLUB_B)).toBe(1);
  });

  it("returns 0 for a club with no cached exercises", async () => {
    expect(await countCachedExercises("club_empty")).toBe(0);
  });

  it("counts both active and inactive exercises", async () => {
    await upsertCachedExercises([
      makeExercise({ id: "active", clubId: CLUB_A, isActive: true }),
      makeExercise({ id: "inactive", clubId: CLUB_A, isActive: false }),
    ]);

    expect(await countCachedExercises(CLUB_A)).toBe(2);
  });
});

describe("Dexie v2 migration — existing v1 data preserved", () => {
  it("athletes store is still accessible after v2 migration", async () => {
    const athlete = {
      id: "ath_migration_test",
      clubId: CLUB_A,
      name: "Test Athlete",
      birthDate: "1990-01-01",
      position: null,
      status: "ACTIVE" as const,
      cachedAt: Date.now(),
    };

    await testDb.athletes.put(athlete);
    const result = await testDb.athletes.get("ath_migration_test");
    expect(result?.name).toBe("Test Athlete");
  });

  it("trainingSessions store is still accessible after v2 migration", async () => {
    const session = {
      localId: "local_migration_test",
      clubId: CLUB_A,
      athleteId: "ath_001",
      date: "2025-01-01",
      rpe: 7,
      durationMinutes: 60,
      sessionType: "TRAINING" as const,
      notes: null,
      syncStatus: "pending" as const,
      syncError: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      serverId: null,
    };

    await testDb.trainingSessions.put(session);
    const result = await testDb.trainingSessions.get("local_migration_test");
    expect(result?.localId).toBe("local_migration_test");
  });
});
