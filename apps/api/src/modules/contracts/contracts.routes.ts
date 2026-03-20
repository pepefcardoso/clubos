import type { FastifyInstance } from "fastify";
import {
  CreateContractSchema,
  UpdateContractSchema,
  ListContractsQuerySchema,
} from "./contracts.schema.js";
import {
  createContract,
  getContractById,
  updateContract,
  listContracts,
  ContractNotFoundError,
  ActiveContractAlreadyExistsError,
  ContractAlreadyTerminatedError,
  AthleteNotFoundError,
} from "./contracts.service.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { assertContractExists } from "../../lib/assert-tenant-ownership.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function contractRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/contracts
   * List — no single-resource ID.
   */
  fastify.get("/", async (request, reply) => {
    const parsed = ListContractsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsed.error.issues[0]?.message ?? "Invalid query params",
      });
    }

    const user = request.user as AccessTokenPayload;
    const result = await listContracts(
      fastify.prisma,
      user.clubId,
      parsed.data,
    );
    return reply.status(200).send(result);
  });

  /**
   * GET /api/contracts/:contractId
   * L-04: assertContractExists inside withTenantSchema.
   */
  fastify.get("/:contractId", async (request, reply) => {
    const { contractId } = request.params as { contractId: string };
    const user = request.user as AccessTokenPayload;

    try {
      const contract = await withTenantSchema(
        fastify.prisma,
        user.clubId,
        async (tx) => {
          await assertContractExists(tx, contractId);
          return getContractById(tx, user.clubId, contractId);
        },
      );
      return reply.status(200).send(contract);
    } catch (err) {
      if (err instanceof ContractNotFoundError) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Contrato não encontrado",
        });
      }
      throw err;
    }
  });

  /**
   * POST /api/contracts
   * Create — validates athleteId exists via service layer.
   * Restricted to ADMIN.
   */
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateContractSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const contract = await createContract(
          fastify.prisma,
          user.clubId,
          request.actorId,
          parsed.data,
        );
        return reply.status(201).send(contract);
      } catch (err) {
        if (err instanceof AthleteNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Atleta não encontrado",
          });
        }
        if (err instanceof ActiveContractAlreadyExistsError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );

  /**
   * PUT /api/contracts/:contractId
   * L-04: assertContractExists before mutation.
   * Restricted to ADMIN.
   */
  fastify.put(
    "/:contractId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { contractId } = request.params as { contractId: string };

      const parsed = UpdateContractSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const user = request.user as AccessTokenPayload;

      try {
        const contract = await withTenantSchema(
          fastify.prisma,
          user.clubId,
          async (tx) => {
            await assertContractExists(tx, contractId);
            return updateContract(
              tx,
              user.clubId,
              request.actorId,
              contractId,
              parsed.data,
            );
          },
        );
        return reply.status(200).send(contract);
      } catch (err) {
        if (err instanceof ContractNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Contrato não encontrado",
          });
        }
        if (err instanceof ActiveContractAlreadyExistsError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: err.message,
          });
        }
        if (err instanceof ContractAlreadyTerminatedError) {
          return reply.status(422).send({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
