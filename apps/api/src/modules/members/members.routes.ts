import type { FastifyInstance } from "fastify";
import {
  CreateMemberSchema,
  UpdateMemberSchema,
  ListMembersQuerySchema,
} from "./members.schema.js";
import {
  createMember,
  listMembers,
  getMemberById,
  updateMember,
  DuplicateCpfError,
  PlanNotFoundError,
  MemberNotFoundError,
} from "./members.service.js";
import { importMembersFromCsv } from "./members-import.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/members
   * Returns a paginated, filterable list of members for the authenticated club.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListMembersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const user = request.user as AccessTokenPayload;

    const result = await listMembers(fastify.prisma, user.clubId, parsed.data);
    return reply.status(200).send(result);
  });

  /**
   * POST /api/members
   * Creates a single member for the authenticated club.
   * Accessible by both ADMIN and TREASURER.
   */
  fastify.post("/", async (request, reply) => {
    const parsed = CreateMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    const user = request.user as AccessTokenPayload;

    try {
      const member = await createMember(
        fastify.prisma,
        user.clubId,
        request.actorId,
        parsed.data,
      );
      return reply.status(201).send(member);
    } catch (err) {
      if (err instanceof DuplicateCpfError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Sócio com este CPF já está cadastrado",
        });
      }
      if (err instanceof PlanNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Plano não encontrado ou inativo",
        });
      }
      throw err;
    }
  });

  /**
   * GET /api/members/:memberId
   * Returns a single member with their active plan.
   * Accessible by both ADMIN and TREASURER.
   */
  fastify.get("/:memberId", async (request, reply) => {
    const { memberId } = request.params as { memberId: string };
    const user = request.user as AccessTokenPayload;

    try {
      const member = await getMemberById(fastify.prisma, user.clubId, memberId);
      return reply.status(200).send(member);
    } catch (err) {
      if (err instanceof MemberNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Sócio não encontrado",
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/members/:memberId
   * Partially updates a member. Supports: name, phone, email, planId, status.
   * CPF is immutable — it is intentionally absent from the update schema.
   * Restricted to ADMIN role.
   *
   * Plan assignment:
   *   - planId present   → ends current active MemberPlan, creates new one
   *   - planId: null     → ends current active MemberPlan (removes plan assignment)
   *   - planId absent    → leaves plan unchanged
   */
  fastify.put(
    "/:memberId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { memberId } = request.params as { memberId: string };

      const parsed = UpdateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const member = await updateMember(
          fastify.prisma,
          user.clubId,
          request.actorId,
          memberId,
          parsed.data,
        );
        return reply.status(200).send(member);
      } catch (err) {
        if (err instanceof MemberNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Sócio não encontrado",
          });
        }
        throw err;
      }
    },
  );

  /**
   * POST /api/members/import
   * Bulk-imports members from a CSV file.
   */
  fastify.post("/import", async (request, reply) => {
    let data;
    try {
      data = await request.file();
    } catch (err) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 413) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Arquivo excede o limite de 5 MB",
        });
      }
      throw err;
    }

    if (!data) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Arquivo CSV não enviado",
      });
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (err) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 413) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Arquivo excede o limite de 5 MB",
        });
      }
      throw err;
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Arquivo excede o limite de 5 MB",
      });
    }

    const csvString = buffer.toString("utf-8");
    const user = request.user as AccessTokenPayload;

    const result = await importMembersFromCsv(
      fastify.prisma,
      user.clubId,
      request.actorId,
      csvString,
    );

    if ("error" in result) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: result.error,
      });
    }

    return reply.status(200).send(result);
  });
}
