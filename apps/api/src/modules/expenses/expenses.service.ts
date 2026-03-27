import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
  ExpenseResponse,
  ExpensesListResult,
} from "./expenses.schema.js";

export class ExpenseNotFoundError extends NotFoundError {
  constructor() {
    super("Despesa não encontrada.");
  }
}

/**
 * Maps a raw Prisma Expense row to the API response shape.
 * The `date` column is a PostgreSQL DATE — Prisma returns it as a Date object
 * at midnight UTC. We slice the ISO string to "YYYY-MM-DD" to avoid any
 * timezone-related day-shift when serialised to JSON.
 */
function toResponse(expense: {
  id: string;
  description: string;
  amountCents: number;
  category: string;
  date: Date;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ExpenseResponse {
  return {
    id: expense.id,
    description: expense.description,
    amountCents: expense.amountCents,
    category: expense.category as ExpenseResponse["category"],
    date: expense.date.toISOString().slice(0, 10),
    notes: expense.notes,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
  };
}

/**
 * Creates a new expense in the tenant schema and emits an EXPENSE_CREATED
 * audit log entry. Wraps both operations in the same tenant transaction.
 */
export async function createExpense(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateExpenseInput,
): Promise<ExpenseResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const expense = await tx.expense.create({
      data: {
        description: input.description,
        amountCents: input.amountCents,
        category: input.category,
        date: new Date(input.date),
        notes: input.notes ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EXPENSE_CREATED",
        entityId: expense.id,
        entityType: "Expense",
        metadata: {
          description: expense.description,
          amountCents: expense.amountCents,
          category: expense.category,
          date: input.date,
        },
      },
    });

    return toResponse(expense);
  });
}

/**
 * Returns a paginated, optionally filtered list of expenses.
 * Supports month (YYYY-MM) and category filters.
 * Results are ordered newest-date-first.
 */
export async function listExpenses(
  prisma: PrismaClient,
  clubId: string,
  params: ListExpensesQuery,
): Promise<ExpensesListResult> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const { page, limit, month, category } = params;
    const skip = (page - 1) * limit;

    let dateFilter: { gte?: Date; lte?: Date } | undefined;
    if (month) {
      const parts = month.split("-");
      const year = Number(parts[0]);
      const mon = Number(parts[1]);
      if (!Number.isNaN(year) && !Number.isNaN(mon) && mon >= 1 && mon <= 12) {
        dateFilter = {
          gte: new Date(Date.UTC(year, mon - 1, 1)),
          lte: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
        };
      }
    }

    const where: Prisma.ExpenseWhereInput = {
      ...(category !== undefined ? { category } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
    };

    const [expenses, total] = await Promise.all([
      tx.expense.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      tx.expense.count({ where }),
    ]);

    return {
      data: expenses.map(toResponse),
      total,
      page,
      limit,
    };
  });
}

/**
 * Partially updates an expense.
 * Receives the Prisma transaction client (tx) directly — the route handler
 * owns the withTenantSchema wrapper so assertExpenseExists and updateExpense
 * share the same transaction.
 *
 * Throws ExpenseNotFoundError if the expense does not exist.
 */
export async function updateExpense(
  tx: PrismaClient,
  actorId: string,
  expenseId: string,
  input: UpdateExpenseInput,
): Promise<ExpenseResponse> {
  const existing = await tx.expense.findUnique({ where: { id: expenseId } });
  if (!existing) throw new ExpenseNotFoundError();

  const data: Prisma.ExpenseUpdateInput = {};
  if (input.description !== undefined) data.description = input.description;
  if (input.amountCents !== undefined) data.amountCents = input.amountCents;
  if (input.category !== undefined) data.category = input.category;
  if (input.date !== undefined) data.date = new Date(input.date);
  if ("notes" in input) data.notes = input.notes ?? null;

  const updated = await tx.expense.update({
    where: { id: expenseId },
    data,
  });

  await tx.auditLog.create({
    data: {
      actorId,
      action: "EXPENSE_UPDATED",
      entityId: expenseId,
      entityType: "Expense",
      metadata: { changes: input },
    },
  });

  return toResponse(updated);
}

/**
 * Deletes an expense by ID.
 * Receives the Prisma transaction client directly — same reasoning as updateExpense.
 *
 * Throws ExpenseNotFoundError if not found.
 */
export async function deleteExpense(
  tx: PrismaClient,
  actorId: string,
  expenseId: string,
): Promise<void> {
  const existing = await tx.expense.findUnique({ where: { id: expenseId } });
  if (!existing) throw new ExpenseNotFoundError();

  await tx.expense.delete({ where: { id: expenseId } });

  await tx.auditLog.create({
    data: {
      actorId,
      action: "EXPENSE_DELETED",
      entityId: expenseId,
      entityType: "Expense",
      metadata: {
        description: existing.description,
        amountCents: existing.amountCents,
        category: existing.category,
      },
    },
  });
}
