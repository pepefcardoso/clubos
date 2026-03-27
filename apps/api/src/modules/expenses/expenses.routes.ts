import type { FastifyInstance } from "fastify";
import {
  CreateExpenseSchema,
  UpdateExpenseSchema,
  ListExpensesQuerySchema,
} from "./expenses.schema.js";
import {
  createExpense,
  listExpenses,
  updateExpense,
  deleteExpense,
  ExpenseNotFoundError,
} from "./expenses.service.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { assertExpenseExists } from "../../lib/assert-tenant-ownership.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function expenseRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/expenses
   * List expenses — available to both ADMIN and TREASURER.
   * Supports optional month (YYYY-MM) and category filters.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListExpensesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const { clubId } = request.user as AccessTokenPayload;
    const result = await listExpenses(fastify.prisma, clubId, parsed.data);
    return reply.status(200).send(result);
  });

  /**
   * POST /api/expenses
   * Create a new expense — ADMIN only.
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateExpenseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const expense = await createExpense(
        fastify.prisma,
        clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(expense);
    },
  );

  /**
   * PUT /api/expenses/:expenseId
   * Update an expense — ADMIN only.
   * assertExpenseExists and updateExpense share the same withTenantSchema
   * transaction to prevent IDOR and avoid double-nesting.
   */
  fastify.put(
    "/:expenseId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { expenseId } = request.params as { expenseId: string };

      const parsed = UpdateExpenseSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const expense = await withTenantSchema(
          fastify.prisma,
          clubId,
          async (tx) => {
            await assertExpenseExists(tx, expenseId);
            return updateExpense(tx, request.actorId, expenseId, parsed.data);
          },
        );
        return reply.status(200).send(expense);
      } catch (err) {
        if (err instanceof ExpenseNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Despesa não encontrada.",
          });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/expenses/:expenseId
   * Delete an expense — ADMIN only.
   * assertExpenseExists and deleteExpense share the same withTenantSchema
   * transaction (same IDOR-prevention pattern as PUT above).
   */
  fastify.delete(
    "/:expenseId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { expenseId } = request.params as { expenseId: string };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        await withTenantSchema(fastify.prisma, clubId, async (tx) => {
          await assertExpenseExists(tx, expenseId);
          return deleteExpense(tx, request.actorId, expenseId);
        });
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof ExpenseNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Despesa não encontrada.",
          });
        }
        throw err;
      }
    },
  );
}
