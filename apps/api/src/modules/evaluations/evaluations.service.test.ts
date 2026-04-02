import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  createEvaluation,
  getEvaluationById,
  updateEvaluation,
  deleteEvaluation,
  listEvaluations,
  EvaluationNotFoundError,
  DuplicateEvaluationError,
} from "./evaluations.service.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    athlete: {
      findUnique: vi.fn(),
    },
    technicalEvaluation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
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
const ATHLETE_ID = "athlete_001";
const EVAL_ID = "eval_001";

const BASE_INPUT = {
  athleteId: ATHLETE_ID,
  microcycle: "2025-W03",
  date: "2025-01-13",
  technique: 4,
  tactical: 3,
  physical: 5,
  mental: 4,
  attitude: 5,
};

const EVAL_ROW = {
  id: EVAL_ID,
  athleteId: ATHLETE_ID,
  microcycle: "2025-W03",
  date: new Date("2025-01-13"),
  technique: 4,
  tactical: 3,
  physical: 5,
  mental: 4,
  attitude: 5,
  notes: null,
  actorId: ACTOR_ID,
  createdAt: new Date("2025-01-13T10:00:00Z"),
  updatedAt: new Date("2025-01-13T10:00:00Z"),
};

const ATHLETE_ROW = { id: ATHLETE_ID, name: "Carlos Eduardo" };

describe("EvaluationNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new EvaluationNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new EvaluationNotFoundError().name).toBe("EvaluationNotFoundError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new EvaluationNotFoundError().message).toMatch(/Avaliação/);
  });

  it("can be caught via instanceof", () => {
    expect(() => {
      throw new EvaluationNotFoundError();
    }).toThrowError(EvaluationNotFoundError);
  });
});

describe("DuplicateEvaluationError", () => {
  it("is an instance of Error", () => {
    expect(new DuplicateEvaluationError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new DuplicateEvaluationError().name).toBe(
      "DuplicateEvaluationError",
    );
  });

  it("message mentions microciclo", () => {
    expect(new DuplicateEvaluationError().message).toMatch(/microciclo/);
  });
});

describe("createEvaluation()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(
      ATHLETE_ROW as never,
    );
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.technicalEvaluation.create).mockResolvedValue(
      EVAL_ROW as never,
    );
  });

  it("returns the created evaluation with athleteName", async () => {
    const result = await createEvaluation(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      BASE_INPUT,
    );
    expect(result.id).toBe(EVAL_ID);
    expect(result.athleteName).toBe("Carlos Eduardo");
  });

  it("computes averageScore correctly — (4+3+5+4+5)/5 = 4.20", async () => {
    const result = await createEvaluation(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      BASE_INPUT,
    );
    expect(result.averageScore).toBe(4.2);
  });

  it("averageScore = 1.00 when all scores are 1", async () => {
    const allOnes = {
      ...BASE_INPUT,
      technique: 1,
      tactical: 1,
      physical: 1,
      mental: 1,
      attitude: 1,
    };
    vi.mocked(prisma.technicalEvaluation.create).mockResolvedValue({
      ...EVAL_ROW,
      technique: 1,
      tactical: 1,
      physical: 1,
      mental: 1,
      attitude: 1,
    } as never);
    const result = await createEvaluation(prisma, CLUB_ID, ACTOR_ID, allOnes);
    expect(result.averageScore).toBe(1.0);
  });

  it("averageScore = 5.00 when all scores are 5", async () => {
    const allFives = {
      ...BASE_INPUT,
      technique: 5,
      tactical: 5,
      physical: 5,
      mental: 5,
      attitude: 5,
    };
    vi.mocked(prisma.technicalEvaluation.create).mockResolvedValue({
      ...EVAL_ROW,
      technique: 5,
      tactical: 5,
      physical: 5,
      mental: 5,
      attitude: 5,
    } as never);
    const result = await createEvaluation(prisma, CLUB_ID, ACTOR_ID, allFives);
    expect(result.averageScore).toBe(5.0);
  });

  it("throws DuplicateEvaluationError when (athleteId, microcycle) already exists", async () => {
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue(
      EVAL_ROW as never,
    );
    await expect(
      createEvaluation(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT),
    ).rejects.toThrowError(DuplicateEvaluationError);
  });

  it("throws NotFoundError when athlete does not exist", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(null);
    await expect(
      createEvaluation(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT),
    ).rejects.toThrow("Atleta não encontrado");
  });

  it("writes an audit log entry with EVALUATION_CREATED action", async () => {
    await createEvaluation(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "EVALUATION_CREATED",
          entityType: "TechnicalEvaluation",
          actorId: ACTOR_ID,
        }),
      }),
    );
  });

  it("stores null for notes when not provided", async () => {
    await createEvaluation(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.technicalEvaluation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: null }),
      }),
    );
  });

  it("stores provided notes correctly", async () => {
    const withNotes = { ...BASE_INPUT, notes: "Excelente posicionamento" };
    vi.mocked(prisma.technicalEvaluation.create).mockResolvedValue({
      ...EVAL_ROW,
      notes: "Excelente posicionamento",
    } as never);
    const result = await createEvaluation(prisma, CLUB_ID, ACTOR_ID, withNotes);
    expect(result.notes).toBe("Excelente posicionamento");
  });

  it("calls withTenantSchema (uses $transaction)", async () => {
    await createEvaluation(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("getEvaluationById()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue({
      ...EVAL_ROW,
      athlete: { name: "Carlos Eduardo" },
    } as never);
  });

  it("returns the evaluation with athleteName", async () => {
    const result = await getEvaluationById(prisma, CLUB_ID, EVAL_ID);
    expect(result.id).toBe(EVAL_ID);
    expect(result.athleteName).toBe("Carlos Eduardo");
  });

  it("throws EvaluationNotFoundError for unknown id", async () => {
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue(null);
    await expect(
      getEvaluationById(prisma, CLUB_ID, "nonexistent"),
    ).rejects.toThrowError(EvaluationNotFoundError);
  });

  it("date field is formatted as YYYY-MM-DD string", async () => {
    const result = await getEvaluationById(prisma, CLUB_ID, EVAL_ID);
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("updateEvaluation()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue({
      ...EVAL_ROW,
      athlete: { name: "Carlos Eduardo" },
    } as never);
    vi.mocked(prisma.technicalEvaluation.update).mockResolvedValue({
      ...EVAL_ROW,
      technique: 5,
      athlete: { name: "Carlos Eduardo" },
    } as never);
  });

  it("returns updated evaluation", async () => {
    const result = await updateEvaluation(prisma, CLUB_ID, ACTOR_ID, EVAL_ID, {
      technique: 5,
    });
    expect(result.technique).toBe(5);
  });

  it("throws EvaluationNotFoundError for unknown id", async () => {
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue(null);
    await expect(
      updateEvaluation(prisma, CLUB_ID, ACTOR_ID, "bad-id", { technique: 3 }),
    ).rejects.toThrowError(EvaluationNotFoundError);
  });

  it("writes an audit log entry with EVALUATION_UPDATED action", async () => {
    await updateEvaluation(prisma, CLUB_ID, ACTOR_ID, EVAL_ID, { mental: 5 });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "EVALUATION_UPDATED" }),
      }),
    );
  });

  it("only passes supplied fields to Prisma update", async () => {
    await updateEvaluation(prisma, CLUB_ID, ACTOR_ID, EVAL_ID, {
      notes: "Updated",
    });
    const call = vi.mocked(prisma.technicalEvaluation.update).mock.calls[0]![0];
    expect(call.data).toEqual({ notes: "Updated" });
  });

  it("supports clearing notes by passing null", async () => {
    vi.mocked(prisma.technicalEvaluation.update).mockResolvedValue({
      ...EVAL_ROW,
      notes: null,
      athlete: { name: "Carlos Eduardo" },
    } as never);
    const result = await updateEvaluation(prisma, CLUB_ID, ACTOR_ID, EVAL_ID, {
      notes: null,
    });
    expect(result.notes).toBeNull();
  });
});

describe("deleteEvaluation()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue({
      id: EVAL_ID,
      microcycle: "2025-W03",
      athleteId: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.technicalEvaluation.delete).mockResolvedValue({} as never);
  });

  it("resolves without error on valid id", async () => {
    await expect(
      deleteEvaluation(prisma, CLUB_ID, ACTOR_ID, EVAL_ID),
    ).resolves.not.toThrow();
  });

  it("throws EvaluationNotFoundError for unknown id", async () => {
    vi.mocked(prisma.technicalEvaluation.findUnique).mockResolvedValue(null);
    await expect(
      deleteEvaluation(prisma, CLUB_ID, ACTOR_ID, "bad-id"),
    ).rejects.toThrowError(EvaluationNotFoundError);
  });

  it("writes an audit log entry with EVALUATION_DELETED action", async () => {
    await deleteEvaluation(prisma, CLUB_ID, ACTOR_ID, EVAL_ID);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "EVALUATION_DELETED" }),
      }),
    );
  });

  it("audit log metadata contains microcycle and athleteId", async () => {
    await deleteEvaluation(prisma, CLUB_ID, ACTOR_ID, EVAL_ID);
    const call = vi.mocked(prisma.auditLog.create).mock.calls[0]![0];
    expect(call.data.metadata).toMatchObject({
      microcycle: "2025-W03",
      athleteId: ATHLETE_ID,
    });
  });
});

describe("listEvaluations()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  const rowWithAthlete = { ...EVAL_ROW, athlete: { name: "Carlos Eduardo" } };

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.technicalEvaluation.findMany).mockResolvedValue([
      rowWithAthlete,
    ] as never);
    vi.mocked(prisma.technicalEvaluation.count).mockResolvedValue(1);
  });

  it("returns paginated response with data and total", async () => {
    const result = await listEvaluations(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("passes athleteId filter to Prisma where clause", async () => {
    await listEvaluations(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      athleteId: ATHLETE_ID,
    });
    const call = vi.mocked(prisma.technicalEvaluation.findMany).mock
      .calls[0]![0];
    expect(call.where).toMatchObject({ athleteId: ATHLETE_ID });
  });

  it("passes microcycle filter to Prisma where clause", async () => {
    await listEvaluations(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      microcycle: "2025-W03",
    });
    const call = vi.mocked(prisma.technicalEvaluation.findMany).mock
      .calls[0]![0];
    expect(call.where).toMatchObject({ microcycle: "2025-W03" });
  });

  it("applies from/to date range filter", async () => {
    await listEvaluations(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      from: "2025-01-01",
      to: "2025-01-31",
    });
    const call = vi.mocked(prisma.technicalEvaluation.findMany).mock
      .calls[0]![0];
    expect(call.where).toMatchObject({
      date: { gte: expect.any(Date), lte: expect.any(Date) },
    });
  });

  it("orders results by date desc", async () => {
    await listEvaluations(prisma, CLUB_ID, { page: 1, limit: 20 });
    const call = vi.mocked(prisma.technicalEvaluation.findMany).mock
      .calls[0]![0];
    expect(call.orderBy).toEqual({ date: "desc" });
  });

  it("returns empty data array when no records match", async () => {
    vi.mocked(prisma.technicalEvaluation.findMany).mockResolvedValue(
      [] as never,
    );
    vi.mocked(prisma.technicalEvaluation.count).mockResolvedValue(0);
    const result = await listEvaluations(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("calls withTenantSchema ($transaction)", async () => {
    await listEvaluations(prisma, CLUB_ID, { page: 1, limit: 20 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
