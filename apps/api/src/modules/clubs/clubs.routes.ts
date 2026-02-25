import type { FastifyInstance } from "fastify";
import { CreateClubSchema } from "./clubs.schema.js";
import {
  createClub,
  DuplicateSlugError,
  DuplicateCnpjError,
} from "./clubs.service.js";

export async function clubRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/clubs
   * Creates a new club and provisions its tenant PostgreSQL schema.
   * Public endpoint — no JWT required (called during onboarding).
   */
  fastify.post("/", async (request, reply) => {
    const parsed = CreateClubSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      });
    }

    try {
      const club = await createClub(fastify.prisma, parsed.data);
      return reply.status(201).send(club);
    } catch (err) {
      if (err instanceof DuplicateSlugError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Um clube com este slug já está cadastrado",
        });
      }
      if (err instanceof DuplicateCnpjError) {
        return reply.status(409).send({
          statusCode: 409,
          error: "Conflict",
          message: "Um clube com este CNPJ já está cadastrado",
        });
      }
      throw err;
    }
  });
}
