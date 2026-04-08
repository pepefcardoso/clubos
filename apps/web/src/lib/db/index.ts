import Dexie, { type EntityTable } from "dexie";
import type {
  CachedAthlete,
  TrainingSession,
  CachedExercise,
  MetaEntry,
} from "./types";

/**
 * BROWSER-ONLY — do not import in Server Components or API Routes.
 * Dexie uses IndexedDB which is not available in Node.js / SSR context.
 *
 * Schema versioning rules:
 * - NEVER modify an existing version block — always add a new version(N).
 * - Breaking changes (removed indexes, renamed columns) require an .upgrade()
 *   migration function in the new version block.
 *
 * Version history:
 *   v1 — athletes + trainingSessions stores
 *   v2 — exercises store added
 *   v3 — meta store added (key-value, used by SW Background Sync for activeClubId)
 */
export class ClubOSDatabase extends Dexie {
  athletes!: EntityTable<CachedAthlete, "id">;
  trainingSessions!: EntityTable<TrainingSession, "localId">;
  exercises!: EntityTable<CachedExercise, "id">;
  meta!: EntityTable<MetaEntry, "key">;

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
    this.version(3).stores({
      meta: "key",
    });
  }
}

export { ClubOSDatabase as default };

/**
 * Lazy singleton — only instantiated in the browser, never during SSR.
 * Import getDb() in DAL files and hooks. Never import in Server Components.
 */
let _db: ClubOSDatabase | null = null;

export function getDb(): ClubOSDatabase {
  if (!_db) {
    _db = new ClubOSDatabase();
  }
  return _db;
}

/**
 * Convenience alias for call sites that previously used `db` directly.
 * Prefer getDb() for new code.
 */
export const db = {
  get current() {
    return getDb();
  },
};
