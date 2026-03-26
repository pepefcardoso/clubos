import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ClubOSDatabase } from "../index";
import type { CachedAthlete } from "../types";

let testDb: ClubOSDatabase;

import {
  upsertCachedAthletes,
  getCachedAthletes,
  getCachedAthlete,
  clearStaleCachedAthletes,
  clearAllCachedAthletes,
  countCachedAthletes,
} from "../athletes.db";

const CLUB_A = "club_aaaaaaaaaaaaaaaaaaa1";
const CLUB_B = "club_bbbbbbbbbbbbbbbbbbb1";

function makeAthlete(
  overrides: Partial<CachedAthlete> & { id: string; clubId: string },
): CachedAthlete {
  return {
    name: "Test Athlete",
    birthDate: "1995-06-15",
    position: "Goleiro",
    status: "ACTIVE",
    cachedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(async () => {
  testDb = new ClubOSDatabase();
  await testDb.open();
});

afterEach(async () => {
  await testDb.athletes.clear();
  await testDb.trainingSessions.clear();
  testDb.close();
});

describe("upsertCachedAthletes", () => {
  it("inserts new athletes", async () => {
    const athletes = [
      makeAthlete({ id: "ath_1", clubId: CLUB_A }),
      makeAthlete({ id: "ath_2", clubId: CLUB_A, name: "Segundo Atleta" }),
    ];
    await upsertCachedAthletes(athletes);

    const count = await countCachedAthletes(CLUB_A);
    expect(count).toBe(2);
  });

  it("updates an existing athlete without creating duplicates (idempotent)", async () => {
    const original = makeAthlete({
      id: "ath_1",
      clubId: CLUB_A,
      name: "Original Name",
    });
    await upsertCachedAthletes([original]);

    const updated = { ...original, name: "Updated Name" };
    await upsertCachedAthletes([updated]);

    const count = await countCachedAthletes(CLUB_A);
    expect(count).toBe(1);

    const fetched = await getCachedAthlete("ath_1");
    expect(fetched?.name).toBe("Updated Name");
  });

  it("handles a large batch without errors", async () => {
    const batch = Array.from({ length: 200 }, (_, i) =>
      makeAthlete({ id: `ath_${i}`, clubId: CLUB_A }),
    );
    await expect(upsertCachedAthletes(batch)).resolves.toBeUndefined();
    const count = await countCachedAthletes(CLUB_A);
    expect(count).toBe(200);
  });

  it("does not store cpf, phone, or email fields", async () => {
    const athleteWithPii = {
      ...makeAthlete({ id: "ath_pii", clubId: CLUB_A }),
      cpf: "12345678901",
      phone: "+5511999990000",
      email: "athlete@example.com",
    } as CachedAthlete & { cpf?: string; phone?: string; email?: string };

    await upsertCachedAthletes([athleteWithPii]);

    const result = await getCachedAthlete("ath_pii");

    if (!result) throw new Error("Athlete not found in cache");

    const stored = result as unknown as Record<string, unknown>;

    expect(stored).not.toHaveProperty("cpf");
    expect(stored).not.toHaveProperty("phone");
    expect(stored).not.toHaveProperty("email");
  });
});

describe("getCachedAthletes", () => {
  beforeEach(async () => {
    await upsertCachedAthletes([
      makeAthlete({ id: "a1", clubId: CLUB_A, status: "ACTIVE" }),
      makeAthlete({ id: "a2", clubId: CLUB_A, status: "INACTIVE" }),
      makeAthlete({ id: "a3", clubId: CLUB_A, status: "SUSPENDED" }),
      makeAthlete({ id: "b1", clubId: CLUB_B, status: "ACTIVE" }),
    ]);
  });

  it("returns all athletes for a club when no status filter is given", async () => {
    const result = await getCachedAthletes(CLUB_A);
    expect(result).toHaveLength(3);
    expect(result.every((a) => a.clubId === CLUB_A)).toBe(true);
  });

  it("filters by status when provided", async () => {
    const result = await getCachedAthletes(CLUB_A, "ACTIVE");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a1");
  });

  it("tenant isolation — does not return athletes from other clubs", async () => {
    const resultA = await getCachedAthletes(CLUB_A);
    const resultB = await getCachedAthletes(CLUB_B);
    expect(resultA.every((a) => a.clubId === CLUB_A)).toBe(true);
    expect(resultB.every((b) => b.clubId === CLUB_B)).toBe(true);
    expect(resultA.some((a) => a.clubId === CLUB_B)).toBe(false);
  });

  it("returns empty array for a club with no cached athletes", async () => {
    const result = await getCachedAthletes("club_nonexistent");
    expect(result).toEqual([]);
  });

  it("returns empty array when status filter matches no records", async () => {
    const result = await getCachedAthletes(CLUB_B, "INACTIVE");
    expect(result).toEqual([]);
  });
});

describe("getCachedAthlete", () => {
  it("returns the athlete by id", async () => {
    await upsertCachedAthletes([
      makeAthlete({ id: "ath_1", clubId: CLUB_A, name: "João" }),
    ]);
    const result = await getCachedAthlete("ath_1");
    expect(result?.name).toBe("João");
  });

  it("returns undefined for a non-existent id", async () => {
    const result = await getCachedAthlete("does-not-exist");
    expect(result).toBeUndefined();
  });
});

describe("clearStaleCachedAthletes", () => {
  it("deletes athletes whose cachedAt is older than 4 hours", async () => {
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000 - 1;
    await upsertCachedAthletes([
      makeAthlete({ id: "stale", clubId: CLUB_A, cachedAt: fourHoursAgo }),
      makeAthlete({ id: "fresh", clubId: CLUB_A, cachedAt: Date.now() }),
    ]);

    await clearStaleCachedAthletes(CLUB_A);

    expect(await getCachedAthlete("stale")).toBeUndefined();
    expect(await getCachedAthlete("fresh")).toBeDefined();
  });

  it("does not delete fresh athletes", async () => {
    await upsertCachedAthletes([
      makeAthlete({ id: "fresh", clubId: CLUB_A, cachedAt: Date.now() }),
    ]);

    await clearStaleCachedAthletes(CLUB_A);

    expect(await countCachedAthletes(CLUB_A)).toBe(1);
  });

  it("only clears stale athletes for the given clubId", async () => {
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000 - 1;
    await upsertCachedAthletes([
      makeAthlete({ id: "a_stale", clubId: CLUB_A, cachedAt: fourHoursAgo }),
      makeAthlete({ id: "b_stale", clubId: CLUB_B, cachedAt: fourHoursAgo }),
    ]);

    await clearStaleCachedAthletes(CLUB_A);

    expect(await getCachedAthlete("a_stale")).toBeUndefined();
    expect(await getCachedAthlete("b_stale")).toBeDefined();
  });
});

describe("clearAllCachedAthletes", () => {
  it("removes all athletes for a club", async () => {
    await upsertCachedAthletes([
      makeAthlete({ id: "a1", clubId: CLUB_A }),
      makeAthlete({ id: "a2", clubId: CLUB_A }),
    ]);

    await clearAllCachedAthletes(CLUB_A);

    expect(await countCachedAthletes(CLUB_A)).toBe(0);
  });

  it("does not remove athletes belonging to other clubs", async () => {
    await upsertCachedAthletes([
      makeAthlete({ id: "a1", clubId: CLUB_A }),
      makeAthlete({ id: "b1", clubId: CLUB_B }),
    ]);

    await clearAllCachedAthletes(CLUB_A);

    expect(await countCachedAthletes(CLUB_A)).toBe(0);
    expect(await countCachedAthletes(CLUB_B)).toBe(1);
  });
});
