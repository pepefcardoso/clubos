import type { FastifyInstance } from "fastify";
import { CreateMemberSchema } from "./members.schema.js";
import {
  createMember,
  DuplicateCpfError,
  PlanNotFoundError,
} from "./members.service.js";
import { importMembersFromCsv } from "./members-import.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
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

  fastify.post("/import", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Arquivo CSV não enviado",
      });
    }

    const buffer = await data.toBuffer();
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
