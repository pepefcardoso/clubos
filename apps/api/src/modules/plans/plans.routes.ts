import type { FastifyInstance } from "fastify";
import {
  CreatePlanSchema,
  UpdatePlanSchema,
  ListPlansQuerySchema,
} from "./plans.schema.js";
import {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  PlanNotFoundError,
  DuplicatePlanNameError,
  PlanHasActiveMembersError,
} from "./plans.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function planRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/plans
   * List — no single-resource ID.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListPlansQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const user = request.user as AccessTokenPayload;
    const plans = await listPlans(fastify.prisma, user.clubId, parsed.data);
    return reply.status(200).send(plans);
  });

  /**
   * POST /api/plans
   * Create — no existing resource ID to check.
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreatePlanSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const plan = await createPlan(
          fastify.prisma,
          user.clubId,
          request.actorId,
          parsed.data,
        );
        return reply.status(201).send(plan);
      } catch (err) {
        if (err instanceof DuplicatePlanNameError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Já existe um plano com este nome",
          });
        }
        throw err;
      }
    },
  );

  /**
   * PUT /api/plans/:planId
   */
  fastify.put(
    "/:planId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { planId } = request.params as { planId: string };

      const parsed = UpdatePlanSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const plan = await updatePlan(
          fastify.prisma,
          user.clubId,
          request.actorId,
          planId,
          parsed.data,
        );
        return reply.status(200).send(plan);
      } catch (err) {
        if (err instanceof PlanNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Plano não encontrado",
          });
        }
        if (err instanceof DuplicatePlanNameError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Já existe um plano com este nome",
          });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/plans/:planId
   */
  fastify.delete(
    "/:planId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { planId } = request.params as { planId: string };
      const user = request.user as AccessTokenPayload;

      try {
        await deletePlan(fastify.prisma, user.clubId, request.actorId, planId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof PlanNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Plano não encontrado",
          });
        }
        if (err instanceof PlanHasActiveMembersError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message:
              "Não é possível excluir um plano com sócios ativos vinculados",
          });
        }
        throw err;
      }
    },
  );
}
