"use client";

import { useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  upsertCachedAthletes,
  getCachedAthletes,
  getCachedAthlete,
  clearAllCachedAthletes,
  countCachedAthletes,
} from "@/lib/db/athletes.db";
import {
  upsertCachedExercises,
  getCachedExercises,
  clearStaleCachedExercises,
} from "@/lib/db/exercises.db";
import {
  createLocalTrainingSession,
  getPendingSessions,
  getSessionsByAthlete,
  getSessionByLocalId,
  markSessionSyncing,
  markSessionSynced,
  markSessionError,
  resetErroredSessions,
  countPendingSessions,
  getSessionsInDateRange,
} from "@/lib/db/training-sessions.db";
import type {
  CachedAthlete,
  CachedExercise,
  CreateTrainingSessionInput,
  AthleteStatus,
  ExerciseCategory,
} from "@/lib/db/types";

/**
 * Provides scoped access to the local IndexedDB layer.
 *
 * All operations are automatically scoped to the authenticated user's clubId —
 * callers never need to pass clubId explicitly. If the user is not authenticated,
 * read operations return empty results and write operations throw.
 *
 * This hook is the primary interface for components and sync workers to interact
 * with the offline data layer. Direct imports of the DAL functions are discouraged
 * in component code — use this hook to ensure consistent auth scoping.
 */
export function useLocalDb() {
  const { user } = useAuth();
  const clubId = user?.clubId;

  const cacheAthletes = useCallback(
    (athletes: CachedAthlete[]): Promise<void> => {
      if (!clubId) return Promise.resolve();
      return upsertCachedAthletes(athletes);
    },
    [clubId],
  );

  const getLocalAthletes = useCallback(
    (status?: AthleteStatus): Promise<CachedAthlete[]> => {
      if (!clubId) return Promise.resolve([]);
      return getCachedAthletes(clubId, status);
    },
    [clubId],
  );

  const getLocalAthlete = useCallback(
    (id: string): Promise<CachedAthlete | undefined> => {
      return getCachedAthlete(id);
    },
    [],
  );

  const clearAthleteCache = useCallback((): Promise<void> => {
    if (!clubId) return Promise.resolve();
    return clearAllCachedAthletes(clubId);
  }, [clubId]);

  const athleteCacheCount = useCallback((): Promise<number> => {
    if (!clubId) return Promise.resolve(0);
    return countCachedAthletes(clubId);
  }, [clubId]);

  /**
   * Upserts a batch of exercises into the local IndexedDB cache.
   * Idempotent — safe to call on every successful API fetch.
   */
  const cacheExercises = useCallback(
    (exercises: CachedExercise[]): Promise<void> => {
      if (!clubId) return Promise.resolve();
      return upsertCachedExercises(exercises);
    },
    [clubId],
  );

  /**
   * Returns cached exercises for the current club, optionally filtered by
   * category. Active-only by default (mirrors the API default).
   */
  const getLocalExercises = useCallback(
    (category?: ExerciseCategory): Promise<CachedExercise[]> => {
      if (!clubId) return Promise.resolve([]);
      return getCachedExercises(clubId, category);
    },
    [clubId],
  );

  /**
   * Evicts exercises whose cachedAt is older than 4 hours.
   * Called before upserting fresh data to avoid stale entries.
   */
  const evictStaleExercises = useCallback((): Promise<void> => {
    if (!clubId) return Promise.resolve();
    return clearStaleCachedExercises(clubId);
  }, [clubId]);

  const addTrainingSession = useCallback(
    (
      input: Omit<CreateTrainingSessionInput, "clubId">,
    ): ReturnType<typeof createLocalTrainingSession> => {
      if (!clubId) return Promise.reject(new Error("Not authenticated"));
      return createLocalTrainingSession({ ...input, clubId });
    },
    [clubId],
  );

  const getPending = useCallback(() => {
    if (!clubId) return Promise.resolve([]);
    return getPendingSessions(clubId);
  }, [clubId]);

  const getAthleteHistory = useCallback(
    (athleteId: string) => {
      if (!clubId) return Promise.resolve([]);
      return getSessionsByAthlete(clubId, athleteId);
    },
    [clubId],
  );

  const getSession = useCallback(
    (localId: string) => getSessionByLocalId(localId),
    [],
  );

  const setSyncing = useCallback(
    (localId: string) => markSessionSyncing(localId),
    [],
  );

  const setSynced = useCallback(
    (localId: string, serverId: string) => markSessionSynced(localId, serverId),
    [],
  );

  const setError = useCallback(
    (localId: string, error: string) => markSessionError(localId, error),
    [],
  );

  const retryErrors = useCallback((): Promise<number> => {
    if (!clubId) return Promise.resolve(0);
    return resetErroredSessions(clubId);
  }, [clubId]);

  const pendingCount = useCallback((): Promise<number> => {
    if (!clubId) return Promise.resolve(0);
    return countPendingSessions(clubId);
  }, [clubId]);

  const getSessionsInRange = useCallback(
    (fromDate: string, toDate: string) => {
      if (!clubId) return Promise.resolve([]);
      return getSessionsInDateRange(clubId, fromDate, toDate);
    },
    [clubId],
  );

  return {
    cacheAthletes,
    getLocalAthletes,
    getLocalAthlete,
    clearAthleteCache,
    athleteCacheCount,
    cacheExercises,
    getLocalExercises,
    evictStaleExercises,
    addTrainingSession,
    getPending,
    getAthleteHistory,
    getSession,
    setSyncing,
    setSynced,
    setError,
    retryErrors,
    pendingCount,
    getSessionsInRange,
  };
}
