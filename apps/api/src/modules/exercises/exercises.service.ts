import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import type {
  CreateExerciseInput,
  UpdateExerciseInput,
  ListExercisesQuery,
  ExerciseResponse,
} from "./exercises.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";

export class ExerciseNotFoundError extends NotFoundError {
  constructor() {
    super("Exercício não encontrado");
  }
}

export class ExerciseInUseError extends ConflictError {
  constructor() {
    super(
      "Exercício está vinculado a sessões existentes e não pode ser excluído",
    );
  }
}

type ExerciseRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  muscleGroups: string[];
  isActive: boolean;
  createdAt: Date;
};

function toResponse(row: ExerciseRow): ExerciseResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    muscleGroups: row.muscleGroups,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

/**
 * Creates a new exercise in the tenant schema.
 * Persists the record and writes an EXERCISE_CREATED audit log entry.
 */
export async function createExercise(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateExerciseInput,
): Promise<ExerciseResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const exercise = await tx.exercise.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        muscleGroups: input.muscleGroups,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EXERCISE_CREATED",
        entityId: exercise.id,
        entityType: "Exercise",
        metadata: { name: exercise.name, category: exercise.category },
      },
    });

    return toResponse(exercise);
  });
}

/**
 * Returns a single exercise by id.
 * Throws ExerciseNotFoundError if no record exists in the tenant schema.
 */
export async function getExerciseById(
  prisma: PrismaClient,
  clubId: string,
  exerciseId: string,
): Promise<ExerciseResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const exercise = await tx.exercise.findUnique({
      where: { id: exerciseId },
    });
    if (!exercise) throw new ExerciseNotFoundError();
    return toResponse(exercise);
  });
}

/**
 * Partially updates an exercise (name, description, category, muscleGroups, isActive).
 * Throws ExerciseNotFoundError if no record exists.
 * Writes an EXERCISE_UPDATED audit log entry.
 */
export async function updateExercise(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  exerciseId: string,
  input: UpdateExerciseInput,
): Promise<ExerciseResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.exercise.findUnique({
      where: { id: exerciseId },
    });
    if (!existing) throw new ExerciseNotFoundError();

    const updated = await tx.exercise.update({
      where: { id: exerciseId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.muscleGroups !== undefined && {
          muscleGroups: input.muscleGroups,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EXERCISE_UPDATED",
        entityId: updated.id,
        entityType: "Exercise",
        metadata: { changes: input },
      },
    });

    return toResponse(updated);
  });
}

/**
 * Soft-deletes an exercise by setting isActive = false.
 * Throws ExerciseNotFoundError if no record exists.
 * Throws ExerciseInUseError if the exercise is referenced by any session_exercises rows,
 * preserving referential integrity of historical training plans.
 * Writes an EXERCISE_DELETED audit log entry.
 */
export async function deleteExercise(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  exerciseId: string,
): Promise<void> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.exercise.findUnique({
      where: { id: exerciseId },
    });
    if (!existing) throw new ExerciseNotFoundError();

    const linkedCount = await tx.sessionExercise.count({
      where: { exerciseId },
    });
    if (linkedCount > 0) throw new ExerciseInUseError();

    await tx.exercise.update({
      where: { id: exerciseId },
      data: { isActive: false },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EXERCISE_DELETED",
        entityId: exerciseId,
        entityType: "Exercise",
        metadata: { name: existing.name },
      },
    });
  });
}

/**
 * Returns a paginated, filterable list of exercises.
 * By default only active exercises are returned (includeInactive=false).
 * Supports optional `category` and `search` (name insensitive contains) filters.
 */
export async function listExercises(
  prisma: PrismaClient,
  clubId: string,
  params: ListExercisesQuery,
): Promise<PaginatedResponse<ExerciseResponse>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = {
      ...(params.includeInactive ? {} : { isActive: true }),
      ...(params.category ? { category: params.category } : {}),
      ...(params.search
        ? { name: { contains: params.search, mode: "insensitive" as const } }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.exercise.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { name: "asc" },
      }),
      tx.exercise.count({ where }),
    ]);

    return {
      data: data.map(toResponse),
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}
