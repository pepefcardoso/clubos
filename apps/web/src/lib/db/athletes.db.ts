import { db } from "./index";
import type { CachedAthlete, AthleteStatus } from "./types";

const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Inserts or updates a batch of athletes in the local cache.
 * Idempotent: calling with the same data twice has no side effects.
 * Uses bulkPut so a single IndexedDB transaction covers the full batch.
 */
export async function upsertCachedAthletes(
  athletes: CachedAthlete[],
): Promise<void> {
  await db.athletes.bulkPut(athletes);
}

/**
 * Returns all cached athletes for a club, optionally filtered by status.
 * Uses the compound [clubId+status] index when a status filter is provided
 * to avoid a full-table scan.
 */
export async function getCachedAthletes(
  clubId: string,
  status?: AthleteStatus,
): Promise<CachedAthlete[]> {
  if (status) {
    return db.athletes
      .where("[clubId+status]")
      .equals([clubId, status])
      .toArray();
  }
  return db.athletes.where("clubId").equals(clubId).toArray();
}

/**
 * Returns a single cached athlete by server ID, or undefined if not cached.
 */
export async function getCachedAthlete(
  id: string,
): Promise<CachedAthlete | undefined> {
  return db.athletes.get(id);
}

/**
 * Deletes athletes for a club whose cachedAt timestamp is older than CACHE_TTL_MS.
 * Called after a successful API fetch to evict stale entries before upserting fresh data.
 */
export async function clearStaleCachedAthletes(clubId: string): Promise<void> {
  const staleThreshold = Date.now() - CACHE_TTL_MS;
  await db.athletes
    .where("clubId")
    .equals(clubId)
    .filter((a) => a.cachedAt < staleThreshold)
    .delete();
}

/**
 * Deletes all cached athletes for a club.
 * Used on logout or explicit cache invalidation (e.g. after bulk server-side edits).
 */
export async function clearAllCachedAthletes(clubId: string): Promise<void> {
  await db.athletes.where("clubId").equals(clubId).delete();
}

/**
 * Returns the number of cached athletes for a club.
 * Useful for determining whether a local cache exists before making an API call.
 */
export async function countCachedAthletes(clubId: string): Promise<number> {
  return db.athletes.where("clubId").equals(clubId).count();
}
