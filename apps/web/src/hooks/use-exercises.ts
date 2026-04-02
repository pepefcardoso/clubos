"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocalDb } from "@/hooks/use-local-db";
import {
  fetchExercises,
  type ExerciseResponse,
  type ExerciseCategory,
} from "@/lib/api/exercises";
import type { CachedExercise } from "@/lib/db/types";

export const EXERCISES_QUERY_KEY = ["exercises"] as const;

interface UseExercisesParams {
  search?: string;
  category?: ExerciseCategory;
  enabled?: boolean;
}

function toExerciseResponse(cached: CachedExercise): ExerciseResponse {
  return {
    id: cached.id,
    name: cached.name,
    description: cached.description,
    category: cached.category as ExerciseCategory,
    muscleGroups: cached.muscleGroups,
    isActive: cached.isActive,
    createdAt: new Date(cached.cachedAt).toISOString(),
  };
}

export function useExercises({
  search,
  category,
  enabled = true,
}: UseExercisesParams = {}) {
  const { getAccessToken, user } = useAuth();
  const { cacheExercises, getLocalExercises, evictStaleExercises } =
    useLocalDb();

  return useQuery({
    queryKey: [...EXERCISES_QUERY_KEY, { search, category }],
    queryFn: async (): Promise<ExerciseResponse[]> => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Not authenticated");

        const result = await fetchExercises(
          { search, category, limit: 200, page: 1 },
          token,
        );

        if (user?.clubId) {
          await evictStaleExercises();
          await cacheExercises(
            result.data.map((ex) => ({
              id: ex.id,
              clubId: user.clubId,
              name: ex.name,
              description: ex.description,
              category: ex.category,
              muscleGroups: ex.muscleGroups,
              isActive: ex.isActive,
              cachedAt: Date.now(),
            })),
          );
        }

        return result.data;
      } catch {
        const cached = await getLocalExercises(category);
        const filtered = search
          ? cached.filter((ex) =>
              ex.name.toLowerCase().includes(search.toLowerCase()),
            )
          : cached;
        return filtered.filter((ex) => ex.isActive).map(toExerciseResponse);
      }
    },
    enabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
