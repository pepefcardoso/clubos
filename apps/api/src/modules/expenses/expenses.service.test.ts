import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createExpense,
  listExpenses,
  updateExpense,
  deleteExpense,
  ExpenseNotFoundError,
} from "./expenses.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

function makeExpenseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "exp_001",
    description: "Salário do goleiro",
    amountCents: 500000,
    category: "SALARY",
    date: new Date("2025-03-01T00:00:00.000Z"),
    notes: null,
    createdAt: new Date("2025-03-01T10:00:00.000Z"),
    updatedAt: new Date("2025-03-01T10:00:00.000Z"),
    ...overrides,
  };
}

let _currentMockTx: ReturnType<typeof buildMockTx>;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_currentMockTx),
  ),
}));

function buildMockTx(
  overrides: {
    expenseFindUnique?: ReturnType<typeof makeExpenseRow> | null;
    expenseCreate?: ReturnType<typeof makeExpenseRow>;
    expenseUpdate?: ReturnType<typeof makeExpenseRow>;
    expenseFindMany?: ReturnType<typeof makeExpenseRow>[];
    expenseCount?: number;
    expenseCreateError?: Error;
  } = {},
) {
  return {
    expense: {
      create: overrides.expenseCreateError
        ? vi.fn().mockRejectedValue(overrides.expenseCreateError)
        : vi
            .fn()
            .mockResolvedValue(overrides.expenseCreate ?? makeExpenseRow()),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.expenseFindUnique !== undefined
            ? overrides.expenseFindUnique
            : makeExpenseRow(),
        ),
      update: vi
        .fn()
        .mockResolvedValue(overrides.expenseUpdate ?? makeExpenseRow()),
      findMany: vi
        .fn()
        .mockResolvedValue(overrides.expenseFindMany ?? [makeExpenseRow()]),
      count: vi.fn().mockResolvedValue(overrides.expenseCount ?? 1),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

const PRISMA_STUB = {} as PrismaClient;
const CLUB_ID = "club_001";
const ACTOR_ID = "user_admin";

describe("ExpenseNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new ExpenseNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new ExpenseNotFoundError().name).toBe("ExpenseNotFoundError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new ExpenseNotFoundError().message).toMatch(/Despesa/);
  });
});

describe("createExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _currentMockTx = buildMockTx();
  });

  const validInput = {
    description: "Salário do goleiro",
    amountCents: 500000,
    category: "SALARY" as const,
    date: "2025-03-01",
    notes: undefined,
  };

  it("returns a correctly shaped ExpenseResponse", async () => {
    const result = await createExpense(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      validInput,
    );

    expect(result).toMatchObject({
      id: "exp_001",
      description: "Salário do goleiro",
      amountCents: 500000,
      category: "SALARY",
      date: "2025-03-01",
      notes: null,
    });
    expect(typeof result.createdAt).toBe("string");
    expect(typeof result.updatedAt).toBe("string");
  });

  it("calls expense.create with correct data", async () => {
    await createExpense(PRISMA_STUB, CLUB_ID, ACTOR_ID, validInput);

    expect(_currentMockTx.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Salário do goleiro",
        amountCents: 500000,
        category: "SALARY",
        notes: null,
      }),
    });
  });

  it("writes an EXPENSE_CREATED audit log entry", async () => {
    await createExpense(PRISMA_STUB, CLUB_ID, ACTOR_ID, validInput);

    expect(_currentMockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: ACTOR_ID,
        action: "EXPENSE_CREATED",
        entityId: "exp_001",
        entityType: "Expense",
      }),
    });
  });

  it("propagates expense.create errors", async () => {
    _currentMockTx = buildMockTx({
      expenseCreateError: new Error("DB write failed"),
    });

    await expect(
      createExpense(PRISMA_STUB, CLUB_ID, ACTOR_ID, validInput),
    ).rejects.toThrow("DB write failed");
  });
});

describe("listExpenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _currentMockTx = buildMockTx();
  });

  it("returns paginated results with correct shape", async () => {
    const result = await listExpenses(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "exp_001",
      amountCents: 500000,
      category: "SALARY",
    });
  });

  it("applies correct skip/take for page 2", async () => {
    _currentMockTx = buildMockTx({ expenseFindMany: [], expenseCount: 0 });

    await listExpenses(PRISMA_STUB, CLUB_ID, { page: 2, limit: 10 });

    const call = _currentMockTx.expense.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
    };
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it("filters by calendar month when month param is provided", async () => {
    _currentMockTx = buildMockTx({ expenseFindMany: [], expenseCount: 0 });

    await listExpenses(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
      month: "2025-03",
    });

    const call = _currentMockTx.expense.findMany.mock.calls[0]?.[0] as {
      where: { date: { gte: Date; lte: Date } };
    };
    expect(call.where.date.gte).toEqual(new Date(Date.UTC(2025, 2, 1)));
    expect(call.where.date.lte).toEqual(
      new Date(Date.UTC(2025, 3, 0, 23, 59, 59, 999)),
    );
  });

  it("does not include date filter when month is absent", async () => {
    _currentMockTx = buildMockTx({ expenseFindMany: [], expenseCount: 0 });

    await listExpenses(PRISMA_STUB, CLUB_ID, { page: 1, limit: 20 });

    const call = _currentMockTx.expense.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).not.toHaveProperty("date");
  });

  it("filters by category when provided", async () => {
    _currentMockTx = buildMockTx({ expenseFindMany: [], expenseCount: 0 });

    await listExpenses(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
      category: "EQUIPMENT",
    });

    const call = _currentMockTx.expense.findMany.mock.calls[0]?.[0] as {
      where: { category: string };
    };
    expect(call.where.category).toBe("EQUIPMENT");
  });

  it("orders results by date desc", async () => {
    _currentMockTx = buildMockTx({ expenseFindMany: [], expenseCount: 0 });

    await listExpenses(PRISMA_STUB, CLUB_ID, { page: 1, limit: 20 });

    const call = _currentMockTx.expense.findMany.mock.calls[0]?.[0] as {
      orderBy: { date: string };
    };
    expect(call.orderBy).toEqual({ date: "desc" });
  });

  it("runs findMany and count in parallel", async () => {
    _currentMockTx = buildMockTx({ expenseFindMany: [], expenseCount: 0 });

    await listExpenses(PRISMA_STUB, CLUB_ID, { page: 1, limit: 20 });

    expect(_currentMockTx.expense.findMany).toHaveBeenCalledTimes(1);
    expect(_currentMockTx.expense.count).toHaveBeenCalledTimes(1);
  });
});

describe("updateExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _currentMockTx = buildMockTx();
  });

  it("returns updated ExpenseResponse", async () => {
    _currentMockTx = buildMockTx({
      expenseUpdate: makeExpenseRow({ description: "Salário atualizado" }),
    });

    const result = await updateExpense(
      _currentMockTx as unknown as PrismaClient,
      ACTOR_ID,
      "exp_001",
      { description: "Salário atualizado" },
    );

    expect(result.description).toBe("Salário atualizado");
  });

  it("throws ExpenseNotFoundError when expense does not exist", async () => {
    _currentMockTx = buildMockTx({ expenseFindUnique: null });

    await expect(
      updateExpense(
        _currentMockTx as unknown as PrismaClient,
        ACTOR_ID,
        "nonexistent",
        { description: "X" },
      ),
    ).rejects.toThrow(ExpenseNotFoundError);
  });

  it("writes an EXPENSE_UPDATED audit log entry", async () => {
    await updateExpense(
      _currentMockTx as unknown as PrismaClient,
      ACTOR_ID,
      "exp_001",
      { amountCents: 600000 },
    );

    expect(_currentMockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "EXPENSE_UPDATED",
        entityId: "exp_001",
        entityType: "Expense",
      }),
    });
  });

  it("allows clearing notes by passing null", async () => {
    await updateExpense(
      _currentMockTx as unknown as PrismaClient,
      ACTOR_ID,
      "exp_001",
      { notes: null },
    );

    expect(_currentMockTx.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: null }),
      }),
    );
  });
});

describe("deleteExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _currentMockTx = buildMockTx();
  });

  it("deletes the expense successfully", async () => {
    await deleteExpense(
      _currentMockTx as unknown as PrismaClient,
      ACTOR_ID,
      "exp_001",
    );

    expect(_currentMockTx.expense.delete).toHaveBeenCalledWith({
      where: { id: "exp_001" },
    });
  });

  it("throws ExpenseNotFoundError when expense does not exist", async () => {
    _currentMockTx = buildMockTx({ expenseFindUnique: null });

    await expect(
      deleteExpense(
        _currentMockTx as unknown as PrismaClient,
        ACTOR_ID,
        "nonexistent",
      ),
    ).rejects.toThrow(ExpenseNotFoundError);
  });

  it("writes an EXPENSE_DELETED audit log entry", async () => {
    await deleteExpense(
      _currentMockTx as unknown as PrismaClient,
      ACTOR_ID,
      "exp_001",
    );

    expect(_currentMockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "EXPENSE_DELETED",
        entityId: "exp_001",
        entityType: "Expense",
        metadata: expect.objectContaining({
          description: "Salário do goleiro",
          amountCents: 500000,
          category: "SALARY",
        }),
      }),
    });
  });

  it("does not call expense.delete when expense is not found", async () => {
    _currentMockTx = buildMockTx({ expenseFindUnique: null });

    await expect(
      deleteExpense(
        _currentMockTx as unknown as PrismaClient,
        ACTOR_ID,
        "nonexistent",
      ),
    ).rejects.toThrow();

    expect(_currentMockTx.expense.delete).not.toHaveBeenCalled();
  });
});
