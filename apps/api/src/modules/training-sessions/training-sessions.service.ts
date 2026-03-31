import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import type {
  CreateTrainingSessionInput,
  UpdateTrainingSessionInput,
  ListTrainingSessionsQuery,
  AddSessionExerciseInput,
  TrainingSessionResponse,
  SessionExerciseResponse,
} from "./training-sessions.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";

export class TrainingSessionNotFoundError extends NotFoundError {
  constructor() {
    super("Sessão de treino não encontrada");
  }
}

export class TrainingSessionCompletedError extends ConflictError {
  constructor() {
    super(
      "Sessões concluídas não podem ser excluídas — são registros históricos",
    );
  }
}

export class ExerciseNotFoundError extends NotFoundError {
  constructor() {
    super("Exercício não encontrado");
  }
}

export class SessionExerciseNotFoundError extends NotFoundError {
  constructor() {
    super("Exercício não está nesta sessão");
  }
}

type SessionExerciseWithExercise = {
  id: string;
  exerciseId: string;
  order: number;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  notes: string | null;
  exercise: {
    name: string;
    category: string;
  };
};

type SessionRow = {
  id: string;
  title: string;
  scheduledAt: Date;
  sessionType: string;
  durationMinutes: number;
  notes: string | null;
  isCompleted: boolean;
  createdAt: Date;
  sessionExercises: SessionExerciseWithExercise[];
};

function toSessionExerciseResponse(
  se: SessionExerciseWithExercise,
): SessionExerciseResponse {
  return {
    id: se.id,
    exerciseId: se.exerciseId,
    exerciseName: se.exercise.name,
    exerciseCategory: se.exercise.category,
    order: se.order,
    sets: se.sets,
    reps: se.reps,
    durationSeconds: se.durationSeconds,
    notes: se.notes,
  };
}

function toResponse(row: SessionRow): TrainingSessionResponse {
  return {
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduledAt.toISOString(),
    sessionType: row.sessionType,
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    isCompleted: row.isCompleted,
    exercises: (row.sessionExercises ?? [])
      .sort((a, b) => a.order - b.order)
      .map(toSessionExerciseResponse),
    createdAt: row.createdAt.toISOString(),
  };
}

const SESSION_INCLUDE = {
  sessionExercises: {
    include: {
      exercise: {
        select: { name: true, category: true },
      },
    },
  },
} as const;

/**
 * Creates a new training session and optionally adds exercises in the same transaction.
 * Writes a TRAINING_SESSION_CREATED audit log entry.
 */
export async function createTrainingSession(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateTrainingSessionInput,
): Promise<TrainingSessionResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const session = await tx.trainingSession.create({
      data: {
        title: input.title,
        scheduledAt: new Date(input.scheduledAt),
        sessionType: input.sessionType,
        durationMinutes: input.durationMinutes,
        notes: input.notes ?? null,
      },
      include: SESSION_INCLUDE,
    });

    if (input.exercises.length > 0) {
      for (const ex of input.exercises) {
        const exercise = await tx.exercise.findUnique({
          where: { id: ex.exerciseId },
          select: { id: true },
        });
        if (!exercise) throw new ExerciseNotFoundError();

        await tx.sessionExercise.create({
          data: {
            trainingSessionId: session.id,
            exerciseId: ex.exerciseId,
            order: ex.order,
            sets: ex.sets ?? null,
            reps: ex.reps ?? null,
            durationSeconds: ex.durationSeconds ?? null,
            notes: ex.notes ?? null,
          },
        });
      }
    }

    const sessionWithExercises = await tx.trainingSession.findUnique({
      where: { id: session.id },
      include: SESSION_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "TRAINING_SESSION_CREATED",
        entityId: session.id,
        entityType: "TrainingSession",
        metadata: {
          title: session.title,
          sessionType: session.sessionType,
          exerciseCount: input.exercises.length,
        },
      },
    });

    return toResponse(sessionWithExercises as unknown as SessionRow);
  });
}

/**
 * Returns a single training session by id with nested exercises (ordered by `order` asc).
 * Throws TrainingSessionNotFoundError if not found.
 */
export async function getTrainingSessionById(
  prisma: PrismaClient,
  clubId: string,
  sessionId: string,
): Promise<TrainingSessionResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const session = await tx.trainingSession.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });
    if (!session) throw new TrainingSessionNotFoundError();
    return toResponse(session as unknown as SessionRow);
  });
}

/**
 * Partially updates a training session.
 * Completed sessions can have all fields updated except deletion.
 * Throws TrainingSessionNotFoundError if not found.
 * Writes a TRAINING_SESSION_UPDATED audit log entry.
 */
export async function updateTrainingSession(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  sessionId: string,
  input: UpdateTrainingSessionInput,
): Promise<TrainingSessionResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.trainingSession.findUnique({
      where: { id: sessionId },
    });
    if (!existing) throw new TrainingSessionNotFoundError();

    const updated = await tx.trainingSession.update({
      where: { id: sessionId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.scheduledAt !== undefined && {
          scheduledAt: new Date(input.scheduledAt),
        }),
        ...(input.sessionType !== undefined && {
          sessionType: input.sessionType,
        }),
        ...(input.durationMinutes !== undefined && {
          durationMinutes: input.durationMinutes,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.isCompleted !== undefined && {
          isCompleted: input.isCompleted,
        }),
      },
      include: SESSION_INCLUDE,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "TRAINING_SESSION_UPDATED",
        entityId: updated.id,
        entityType: "TrainingSession",
        metadata: { changes: input },
      },
    });

    return toResponse(updated as unknown as SessionRow);
  });
}

/**
 * Hard-deletes an incomplete training session.
 * Throws TrainingSessionNotFoundError if not found.
 * Throws TrainingSessionCompletedError if session.isCompleted — completed sessions
 * are historical records and must not be deleted.
 * Writes a TRAINING_SESSION_DELETED audit log entry.
 */
export async function deleteTrainingSession(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  sessionId: string,
): Promise<void> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.trainingSession.findUnique({
      where: { id: sessionId },
    });
    if (!existing) throw new TrainingSessionNotFoundError();
    if (existing.isCompleted) throw new TrainingSessionCompletedError();

    await tx.trainingSession.delete({ where: { id: sessionId } });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "TRAINING_SESSION_DELETED",
        entityId: sessionId,
        entityType: "TrainingSession",
        metadata: { title: existing.title },
      },
    });
  });
}

/**
 * Returns a paginated list of training sessions.
 * Supports optional filters: sessionType, isCompleted, date range (from/to).
 */
export async function listTrainingSessions(
  prisma: PrismaClient,
  clubId: string,
  params: ListTrainingSessionsQuery,
): Promise<PaginatedResponse<TrainingSessionResponse>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = {
      ...(params.sessionType ? { sessionType: params.sessionType } : {}),
      ...(params.isCompleted !== undefined
        ? { isCompleted: params.isCompleted }
        : {}),
      ...(params.from || params.to
        ? {
            scheduledAt: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to
                ? { lte: new Date(`${params.to}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      tx.trainingSession.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { scheduledAt: "desc" },
        include: SESSION_INCLUDE,
      }),
      tx.trainingSession.count({ where }),
    ]);

    return {
      data: data.map((s) => toResponse(s as unknown as SessionRow)),
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}

/**
 * Adds or updates an exercise in a training session.
 * Uses upsert on (trainingSessionId, exerciseId) so calling twice with the
 * same exerciseId updates the prescription rather than creating a duplicate.
 * Throws TrainingSessionNotFoundError if the session does not exist.
 * Throws ExerciseNotFoundError if the exercise does not exist.
 */
export async function addExerciseToSession(
  prisma: PrismaClient,
  clubId: string,
  sessionId: string,
  input: AddSessionExerciseInput,
): Promise<TrainingSessionResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const session = await tx.trainingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new TrainingSessionNotFoundError();

    const exercise = await tx.exercise.findUnique({
      where: { id: input.exerciseId },
      select: { id: true },
    });
    if (!exercise) throw new ExerciseNotFoundError();

    await tx.sessionExercise.upsert({
      where: {
        trainingSessionId_exerciseId: {
          trainingSessionId: sessionId,
          exerciseId: input.exerciseId,
        },
      },
      create: {
        trainingSessionId: sessionId,
        exerciseId: input.exerciseId,
        order: input.order,
        sets: input.sets ?? null,
        reps: input.reps ?? null,
        durationSeconds: input.durationSeconds ?? null,
        notes: input.notes ?? null,
      },
      update: {
        order: input.order,
        sets: input.sets ?? null,
        reps: input.reps ?? null,
        durationSeconds: input.durationSeconds ?? null,
        notes: input.notes ?? null,
      },
    });

    const updated = await tx.trainingSession.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });

    return toResponse(updated as unknown as SessionRow);
  });
}

/**
 * Removes an exercise from a training session.
 * Throws TrainingSessionNotFoundError if the session does not exist.
 * Throws SessionExerciseNotFoundError if the exercise is not in the session.
 */
export async function removeExerciseFromSession(
  prisma: PrismaClient,
  clubId: string,
  sessionId: string,
  exerciseId: string,
): Promise<TrainingSessionResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const session = await tx.trainingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new TrainingSessionNotFoundError();

    const link = await tx.sessionExercise.findUnique({
      where: {
        trainingSessionId_exerciseId: {
          trainingSessionId: sessionId,
          exerciseId,
        },
      },
    });
    if (!link) throw new SessionExerciseNotFoundError();

    await tx.sessionExercise.delete({
      where: {
        trainingSessionId_exerciseId: {
          trainingSessionId: sessionId,
          exerciseId,
        },
      },
    });

    const updated = await tx.trainingSession.findUnique({
      where: { id: sessionId },
      include: SESSION_INCLUDE,
    });

    return toResponse(updated as unknown as SessionRow);
  });
}
