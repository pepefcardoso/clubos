import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  createTrainingSession,
  getTrainingSessionById,
  updateTrainingSession,
  deleteTrainingSession,
  listTrainingSessions,
  addExerciseToSession,
  removeExerciseFromSession,
  TrainingSessionNotFoundError,
  TrainingSessionCompletedError,
  ExerciseNotFoundError,
  SessionExerciseNotFoundError,
} from "./training-sessions.service.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    trainingSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    exercise: {
      findUnique: vi.fn(),
    },
    sessionExercise: {
      create: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";
const ACTOR_ID = "user_actor_001";
const SESSION_ID = "session_001";
const EXERCISE_ID = "exercise_001";

const SESSION_ROW = {
  id: SESSION_ID,
  title: "Treino de Força",
  scheduledAt: new Date("2025-06-01T09:00:00.000Z"),
  sessionType: "TRAINING",
  durationMinutes: 90,
  notes: null,
  isCompleted: false,
  createdAt: new Date("2025-05-01T00:00:00.000Z"),
  updatedAt: new Date("2025-05-01T00:00:00.000Z"),
  sessionExercises: [],
};

const COMPLETED_SESSION_ROW = { ...SESSION_ROW, isCompleted: true };

describe("TrainingSessionNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new TrainingSessionNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new TrainingSessionNotFoundError().name).toBe(
      "TrainingSessionNotFoundError",
    );
  });

  it("carries a Portuguese message", () => {
    expect(new TrainingSessionNotFoundError().message).toMatch(/Sessão/);
  });
});

describe("TrainingSessionCompletedError", () => {
  it("is an instance of Error", () => {
    expect(new TrainingSessionCompletedError()).toBeInstanceOf(Error);
  });

  it("carries a Portuguese message about completed sessions", () => {
    expect(new TrainingSessionCompletedError().message).toMatch(/concluídas/);
  });
});

describe("createTrainingSession()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.trainingSession.create).mockResolvedValue(
      SESSION_ROW as never,
    );
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      SESSION_ROW as never,
    );
  });

  it("returns the created session DTO", async () => {
    const result = await createTrainingSession(prisma, CLUB_ID, ACTOR_ID, {
      title: "Treino de Força",
      scheduledAt: "2025-06-01T09:00:00.000Z",
      durationMinutes: 90,
      sessionType: "TRAINING",
      exercises: [],
    });
    expect(result.id).toBe(SESSION_ID);
    expect(result.title).toBe("Treino de Força");
  });

  it("includes scheduledAt as ISO string in the response", async () => {
    const result = await createTrainingSession(prisma, CLUB_ID, ACTOR_ID, {
      title: "Session",
      scheduledAt: "2025-06-01T09:00:00.000Z",
      durationMinutes: 60,
      sessionType: "TRAINING",
      exercises: [],
    });
    expect(typeof result.scheduledAt).toBe("string");
  });

  it("writes a TRAINING_SESSION_CREATED audit log entry", async () => {
    await createTrainingSession(prisma, CLUB_ID, ACTOR_ID, {
      title: "Test",
      scheduledAt: "2025-06-01T09:00:00.000Z",
      durationMinutes: 60,
      sessionType: "TRAINING",
      exercises: [],
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "TRAINING_SESSION_CREATED",
          entityType: "TrainingSession",
        }),
      }),
    );
  });

  it("throws ExerciseNotFoundError when an exercise in the list does not exist", async () => {
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(null);

    await expect(
      createTrainingSession(prisma, CLUB_ID, ACTOR_ID, {
        title: "Test",
        scheduledAt: "2025-06-01T09:00:00.000Z",
        durationMinutes: 60,
        sessionType: "TRAINING",
        exercises: [{ exerciseId: "ghost", order: 0 }],
      }),
    ).rejects.toBeInstanceOf(ExerciseNotFoundError);
  });

  it("uses withTenantSchema ($transaction)", async () => {
    await createTrainingSession(prisma, CLUB_ID, ACTOR_ID, {
      title: "T",
      scheduledAt: "2025-06-01T09:00:00.000Z",
      durationMinutes: 30,
      sessionType: "TRAINING",
      exercises: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("getTrainingSessionById()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("returns the session DTO when found", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      SESSION_ROW as never,
    );
    const result = await getTrainingSessionById(prisma, CLUB_ID, SESSION_ID);
    expect(result.id).toBe(SESSION_ID);
  });

  it("throws TrainingSessionNotFoundError when null", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(null);
    await expect(
      getTrainingSessionById(prisma, CLUB_ID, "ghost"),
    ).rejects.toBeInstanceOf(TrainingSessionNotFoundError);
  });

  it("returns exercises sorted by order ascending", async () => {
    const withExercises = {
      ...SESSION_ROW,
      sessionExercises: [
        {
          id: "se2",
          exerciseId: "e2",
          order: 2,
          sets: null,
          reps: null,
          durationSeconds: null,
          notes: null,
          exercise: { name: "B", category: "CARDIO" },
        },
        {
          id: "se1",
          exerciseId: "e1",
          order: 0,
          sets: null,
          reps: null,
          durationSeconds: null,
          notes: null,
          exercise: { name: "A", category: "STRENGTH" },
        },
      ],
    };
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      withExercises as never,
    );
    const result = await getTrainingSessionById(prisma, CLUB_ID, SESSION_ID);
    expect(result.exercises[0]?.exerciseName).toBe("A");
    expect(result.exercises[1]?.exerciseName).toBe("B");
  });
});

describe("updateTrainingSession()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      SESSION_ROW as never,
    );
    vi.mocked(prisma.trainingSession.update).mockResolvedValue({
      ...SESSION_ROW,
      title: "Updated",
    } as never);
  });

  it("throws TrainingSessionNotFoundError when session does not exist", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(null);
    await expect(
      updateTrainingSession(prisma, CLUB_ID, ACTOR_ID, "ghost", { title: "X" }),
    ).rejects.toBeInstanceOf(TrainingSessionNotFoundError);
  });

  it("returns updated session DTO", async () => {
    const result = await updateTrainingSession(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      SESSION_ID,
      {
        title: "Updated",
      },
    );
    expect(result.title).toBe("Updated");
  });

  it("writes a TRAINING_SESSION_UPDATED audit log entry", async () => {
    await updateTrainingSession(prisma, CLUB_ID, ACTOR_ID, SESSION_ID, {
      isCompleted: true,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "TRAINING_SESSION_UPDATED" }),
      }),
    );
  });

  it("allows updating a completed session (only deletion is blocked)", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      COMPLETED_SESSION_ROW as never,
    );
    vi.mocked(prisma.trainingSession.update).mockResolvedValue(
      COMPLETED_SESSION_ROW as never,
    );
    await expect(
      updateTrainingSession(prisma, CLUB_ID, ACTOR_ID, SESSION_ID, {
        title: "New",
      }),
    ).resolves.toBeDefined();
  });
});

describe("deleteTrainingSession()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.trainingSession.delete).mockResolvedValue(
      SESSION_ROW as never,
    );
  });

  it("throws TrainingSessionNotFoundError when session does not exist", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(null);
    await expect(
      deleteTrainingSession(prisma, CLUB_ID, ACTOR_ID, "ghost"),
    ).rejects.toBeInstanceOf(TrainingSessionNotFoundError);
  });

  it("throws TrainingSessionCompletedError when session is completed", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      COMPLETED_SESSION_ROW as never,
    );
    await expect(
      deleteTrainingSession(prisma, CLUB_ID, ACTOR_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(TrainingSessionCompletedError);
  });

  it("hard-deletes an incomplete session", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      SESSION_ROW as never,
    );
    await deleteTrainingSession(prisma, CLUB_ID, ACTOR_ID, SESSION_ID);
    expect(prisma.trainingSession.delete).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
    });
  });

  it("writes a TRAINING_SESSION_DELETED audit log entry", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      SESSION_ROW as never,
    );
    await deleteTrainingSession(prisma, CLUB_ID, ACTOR_ID, SESSION_ID);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "TRAINING_SESSION_DELETED" }),
      }),
    );
  });
});

describe("listTrainingSessions()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.trainingSession.findMany).mockResolvedValue([
      SESSION_ROW,
    ] as never);
    vi.mocked(prisma.trainingSession.count).mockResolvedValue(1);
  });

  it("returns paginated response", async () => {
    const result = await listTrainingSessions(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("applies sessionType filter", async () => {
    await listTrainingSessions(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      sessionType: "MATCH",
    });
    const where = vi.mocked(prisma.trainingSession.findMany).mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).toHaveProperty("sessionType", "MATCH");
  });

  it("applies isCompleted filter", async () => {
    await listTrainingSessions(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      isCompleted: false,
    });
    const where = vi.mocked(prisma.trainingSession.findMany).mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).toHaveProperty("isCompleted", false);
  });

  it("calculates correct skip for page 2", async () => {
    await listTrainingSessions(prisma, CLUB_ID, { page: 2, limit: 10 });
    const args = vi.mocked(prisma.trainingSession.findMany).mock.calls[0]?.[0];
    expect(args?.skip).toBe(10);
    expect(args?.take).toBe(10);
  });
});

describe("addExerciseToSession()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      SESSION_ROW as never,
    );
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue({
      id: EXERCISE_ID,
    } as never);
    vi.mocked(prisma.sessionExercise.upsert).mockResolvedValue({} as never);
  });

  it("throws TrainingSessionNotFoundError when session does not exist", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(null);
    await expect(
      addExerciseToSession(prisma, CLUB_ID, "ghost", {
        exerciseId: EXERCISE_ID,
        order: 0,
      }),
    ).rejects.toBeInstanceOf(TrainingSessionNotFoundError);
  });

  it("throws ExerciseNotFoundError when exercise does not exist", async () => {
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(null);
    await expect(
      addExerciseToSession(prisma, CLUB_ID, SESSION_ID, {
        exerciseId: "ghost",
        order: 0,
      }),
    ).rejects.toBeInstanceOf(ExerciseNotFoundError);
  });

  it("calls sessionExercise.upsert with correct data", async () => {
    await addExerciseToSession(prisma, CLUB_ID, SESSION_ID, {
      exerciseId: EXERCISE_ID,
      order: 1,
      sets: 3,
      reps: 10,
    });
    expect(prisma.sessionExercise.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          trainingSessionId: SESSION_ID,
          exerciseId: EXERCISE_ID,
          sets: 3,
          reps: 10,
        }),
      }),
    );
  });
});

describe("removeExerciseFromSession()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(
      SESSION_ROW as never,
    );
    vi.mocked(prisma.sessionExercise.findUnique).mockResolvedValue({
      id: "se_001",
    } as never);
    vi.mocked(prisma.sessionExercise.delete).mockResolvedValue({} as never);
  });

  it("throws TrainingSessionNotFoundError when session does not exist", async () => {
    vi.mocked(prisma.trainingSession.findUnique).mockResolvedValue(null);
    await expect(
      removeExerciseFromSession(prisma, CLUB_ID, "ghost", EXERCISE_ID),
    ).rejects.toBeInstanceOf(TrainingSessionNotFoundError);
  });

  it("throws SessionExerciseNotFoundError when link does not exist", async () => {
    vi.mocked(prisma.sessionExercise.findUnique).mockResolvedValue(null);
    await expect(
      removeExerciseFromSession(prisma, CLUB_ID, SESSION_ID, "ghost_exercise"),
    ).rejects.toBeInstanceOf(SessionExerciseNotFoundError);
  });

  it("calls sessionExercise.delete", async () => {
    await removeExerciseFromSession(prisma, CLUB_ID, SESSION_ID, EXERCISE_ID);
    expect(prisma.sessionExercise.delete).toHaveBeenCalledOnce();
  });
});
