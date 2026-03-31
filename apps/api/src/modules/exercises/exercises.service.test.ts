import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  createExercise,
  getExerciseById,
  updateExercise,
  deleteExercise,
  listExercises,
  ExerciseNotFoundError,
  ExerciseInUseError,
} from "./exercises.service.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    exercise: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    sessionExercise: {
      count: vi.fn(),
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
const EXERCISE_ID = "exercise_001";

const EXERCISE_ROW = {
  id: EXERCISE_ID,
  name: "Supino Reto",
  description: "Peito completo",
  category: "STRENGTH",
  muscleGroups: ["peitoral", "tríceps"],
  isActive: true,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
};

describe("ExerciseNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new ExerciseNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new ExerciseNotFoundError().name).toBe("ExerciseNotFoundError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new ExerciseNotFoundError().message).toMatch(/Exercício/);
  });

  it("can be caught via instanceof in a catch block", () => {
    expect(() => {
      throw new ExerciseNotFoundError();
    }).toThrowError(ExerciseNotFoundError);
  });
});

describe("ExerciseInUseError", () => {
  it("is an instance of Error", () => {
    expect(new ExerciseInUseError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new ExerciseInUseError().name).toBe("ExerciseInUseError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new ExerciseInUseError().message).toMatch(/Exercício/);
  });

  it("can be caught via instanceof in a catch block", () => {
    expect(() => {
      throw new ExerciseInUseError();
    }).toThrowError(ExerciseInUseError);
  });
});

describe("createExercise()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.exercise.create).mockResolvedValue(EXERCISE_ROW as never);
  });

  it("returns the created exercise DTO", async () => {
    const result = await createExercise(prisma, CLUB_ID, ACTOR_ID, {
      name: "Supino Reto",
      category: "STRENGTH",
      muscleGroups: ["peitoral"],
    });
    expect(result.id).toBe(EXERCISE_ID);
    expect(result.name).toBe("Supino Reto");
  });

  it("calls exercise.create with correct data", async () => {
    await createExercise(prisma, CLUB_ID, ACTOR_ID, {
      name: "Supino Reto",
      category: "STRENGTH",
      muscleGroups: [],
    });
    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Supino Reto",
          category: "STRENGTH",
        }),
      }),
    );
  });

  it("writes an EXERCISE_CREATED audit log entry", async () => {
    await createExercise(prisma, CLUB_ID, ACTOR_ID, {
      name: "Supino Reto",
      category: "STRENGTH",
      muscleGroups: [],
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: ACTOR_ID,
          action: "EXERCISE_CREATED",
          entityType: "Exercise",
        }),
      }),
    );
  });

  it("uses withTenantSchema ($transaction)", async () => {
    await createExercise(prisma, CLUB_ID, ACTOR_ID, {
      name: "Supino Reto",
      category: "STRENGTH",
      muscleGroups: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("stores null description when not provided", async () => {
    await createExercise(prisma, CLUB_ID, ACTOR_ID, {
      name: "Test",
      category: "OTHER",
      muscleGroups: [],
    });
    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: null }),
      }),
    );
  });
});

describe("getExerciseById()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("returns the exercise DTO when found", async () => {
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(
      EXERCISE_ROW as never,
    );
    const result = await getExerciseById(prisma, CLUB_ID, EXERCISE_ID);
    expect(result.id).toBe(EXERCISE_ID);
  });

  it("throws ExerciseNotFoundError when record is null", async () => {
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(null);
    await expect(
      getExerciseById(prisma, CLUB_ID, "ghost"),
    ).rejects.toBeInstanceOf(ExerciseNotFoundError);
  });
});

describe("updateExercise()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(
      EXERCISE_ROW as never,
    );
    vi.mocked(prisma.exercise.update).mockResolvedValue({
      ...EXERCISE_ROW,
      name: "Supino Inclinado",
    } as never);
  });

  it("throws ExerciseNotFoundError when exercise does not exist", async () => {
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(null);
    await expect(
      updateExercise(prisma, CLUB_ID, ACTOR_ID, "ghost", { name: "X" }),
    ).rejects.toBeInstanceOf(ExerciseNotFoundError);
  });

  it("returns the updated exercise DTO", async () => {
    const result = await updateExercise(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      EXERCISE_ID,
      {
        name: "Supino Inclinado",
      },
    );
    expect(result.name).toBe("Supino Inclinado");
  });

  it("only passes provided fields to exercise.update", async () => {
    await updateExercise(prisma, CLUB_ID, ACTOR_ID, EXERCISE_ID, {
      name: "New Name",
    });
    const callData = vi.mocked(prisma.exercise.update).mock.calls[0]?.[0]
      ?.data as Record<string, unknown>;
    expect(callData).toHaveProperty("name", "New Name");
    expect(callData).not.toHaveProperty("category");
  });

  it("writes an EXERCISE_UPDATED audit log entry", async () => {
    await updateExercise(prisma, CLUB_ID, ACTOR_ID, EXERCISE_ID, {
      isActive: false,
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "EXERCISE_UPDATED" }),
      }),
    );
  });
});

describe("deleteExercise()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(
      EXERCISE_ROW as never,
    );
    vi.mocked(prisma.sessionExercise.count).mockResolvedValue(0);
    vi.mocked(prisma.exercise.update).mockResolvedValue({
      ...EXERCISE_ROW,
      isActive: false,
    } as never);
  });

  it("throws ExerciseNotFoundError when exercise does not exist", async () => {
    vi.mocked(prisma.exercise.findUnique).mockResolvedValue(null);
    await expect(
      deleteExercise(prisma, CLUB_ID, ACTOR_ID, "ghost"),
    ).rejects.toBeInstanceOf(ExerciseNotFoundError);
  });

  it("throws ExerciseInUseError when linkedCount > 0", async () => {
    vi.mocked(prisma.sessionExercise.count).mockResolvedValue(3);
    await expect(
      deleteExercise(prisma, CLUB_ID, ACTOR_ID, EXERCISE_ID),
    ).rejects.toBeInstanceOf(ExerciseInUseError);
  });

  it("soft-deletes by setting isActive = false", async () => {
    await deleteExercise(prisma, CLUB_ID, ACTOR_ID, EXERCISE_ID);
    expect(prisma.exercise.update).toHaveBeenCalledWith({
      where: { id: EXERCISE_ID },
      data: { isActive: false },
    });
  });

  it("does NOT hard-delete the row", async () => {
    await deleteExercise(prisma, CLUB_ID, ACTOR_ID, EXERCISE_ID);
    expect(
      (prisma.exercise as unknown as Record<string, unknown>)["delete"],
    ).toBeUndefined();
  });

  it("writes an EXERCISE_DELETED audit log entry", async () => {
    await deleteExercise(prisma, CLUB_ID, ACTOR_ID, EXERCISE_ID);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "EXERCISE_DELETED" }),
      }),
    );
  });
});

describe("listExercises()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([
      EXERCISE_ROW,
    ] as never);
    vi.mocked(prisma.exercise.count).mockResolvedValue(1);
  });

  it("returns paginated response with data and total", async () => {
    const result = await listExercises(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      includeInactive: false,
    });
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("filters by isActive=true by default (includeInactive=false)", async () => {
    await listExercises(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      includeInactive: false,
    });
    const where = vi.mocked(prisma.exercise.findMany).mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).toHaveProperty("isActive", true);
  });

  it("omits isActive filter when includeInactive=true", async () => {
    await listExercises(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      includeInactive: true,
    });
    const where = vi.mocked(prisma.exercise.findMany).mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).not.toHaveProperty("isActive");
  });

  it("applies category filter when provided", async () => {
    await listExercises(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      includeInactive: false,
      category: "CARDIO",
    });
    const where = vi.mocked(prisma.exercise.findMany).mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(where).toHaveProperty("category", "CARDIO");
  });

  it("calculates correct skip from page and limit", async () => {
    await listExercises(prisma, CLUB_ID, {
      page: 3,
      limit: 10,
      includeInactive: false,
    });
    const args = vi.mocked(prisma.exercise.findMany).mock.calls[0]?.[0];
    expect(args?.skip).toBe(20);
    expect(args?.take).toBe(10);
  });

  it("returns empty data array when count is 0", async () => {
    vi.mocked(prisma.exercise.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.exercise.count).mockResolvedValue(0);
    const result = await listExercises(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      includeInactive: false,
    });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});
