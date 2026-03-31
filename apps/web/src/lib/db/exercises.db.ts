import { db } from "./index";
import type { CachedExercise, ExerciseCategory } from "./types";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Inserts or updates a batch of exercises in the local cache.
 * Idempotent: calling with the same data twice has no side effects.
 * Uses bulkPut so a single IndexedDB transaction covers the full batch.
 */
export async function upsertCachedExercises(
  exercises: CachedExercise[],
): Promise<void> {
  await db.exercises.bulkPut(exercises);
}

/**
 * Returns cached exercises for a club.
 *
 * When `category` is provided, the compound [clubId+category] index is used
 * to avoid a full-table scan.
 * When `includeInactive` is false (default), inactive exercises are filtered
 * out in-memory after the index lookup — active-only is the common case for
 * the exercise selection UI.
 */
export async function getCachedExercises(
  clubId: string,
  category?: ExerciseCategory,
  includeInactive = false,
): Promise<CachedExercise[]> {
  let collection;

  if (category) {
    collection = db.exercises
      .where("[clubId+category]")
      .equals([clubId, category]);
  } else {
    collection = db.exercises.where("clubId").equals(clubId);
  }

  if (!includeInactive) {
    return collection.filter((e: CachedExercise) => e.isActive).toArray();
  }

  return collection.toArray();
}

/**
 * Returns a single cached exercise by server ID, or undefined if not cached.
 */
export async function getCachedExercise(
  id: string,
): Promise<CachedExercise | undefined> {
  return db.exercises.get(id);
}

/**
 * Deletes exercises for a club whose cachedAt timestamp is older than CACHE_TTL_MS.
 * Called after a successful API fetch to evict stale entries before upserting fresh data.
 */
export async function clearStaleCachedExercises(clubId: string): Promise<void> {
  const staleThreshold = Date.now() - CACHE_TTL_MS;
  await db.exercises
    .where("clubId")
    .equals(clubId)
    .filter((e: CachedExercise) => e.cachedAt < staleThreshold)
    .delete();
}

/**
 * Deletes all cached exercises for a club.
 * Used on logout or explicit cache invalidation (e.g. after bulk server-side edits).
 */
export async function clearAllCachedExercises(clubId: string): Promise<void> {
  await db.exercises.where("clubId").equals(clubId).delete();
}

/**
 * Returns the number of cached exercises for a club.
 * Useful for determining whether a local cache exists before making an API call.
 */
export async function countCachedExercises(clubId: string): Promise<number> {
  return db.exercises.where("clubId").equals(clubId).count();
}
