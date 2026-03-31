import Dexie, { type EntityTable } from "dexie";
import type { CachedAthlete, TrainingSession, CachedExercise } from "./types";

/**
 * BROWSER-ONLY — do not import in Server Components or API Routes.
 * Dexie uses IndexedDB which is not available in Node.js / SSR context.
 * NEVER modify an existing version block — always add a new version(N).
 * Breaking changes (removed indexes, renamed columns) require an .upgrade()
 * migration function in the new version block.
 */

export class ClubOSDatabase extends Dexie {
  athletes!: EntityTable<CachedAthlete, "id">;
  trainingSessions!: EntityTable<TrainingSession, "localId">;
  exercises!: EntityTable<CachedExercise, "id">;

  constructor() {
    if (typeof window === "undefined") {
      throw new Error(
        "ClubOSDatabase must only be instantiated in a browser context. " +
          "Do not import this module in Server Components or API Routes.",
      );
    }

    super("clubos-db");

    this.version(1).stores({
      athletes: "id, clubId, status, [clubId+status], cachedAt",

      trainingSessions:
        "localId, clubId, athleteId, syncStatus, date, [clubId+syncStatus], [clubId+athleteId]",
    });

    this.version(2).stores({
      exercises:
        "id, clubId, category, isActive, [clubId+category], [clubId+isActive], cachedAt",
    });
  }
}

export { ClubOSDatabase as default };

/**
 * Singleton database instance. Import this in DAL files and hooks only.
 * Never import directly in React Server Components.
 */
export const db = new ClubOSDatabase();
