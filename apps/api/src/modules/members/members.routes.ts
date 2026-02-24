import type { FastifyInstance } from "fastify";
import {
  CreateMemberSchema,
  ListMembersQuerySchema,
} from "./members.schema.js";
import {
  createMember,
  listMembers,
  DuplicateCpfError,
  PlanNotFoundError,
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
