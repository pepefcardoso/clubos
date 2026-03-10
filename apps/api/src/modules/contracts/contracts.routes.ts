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
import type { AccessTokenPayload } from "../../types/fastify.js";

/**
 * Fastify plugin that registers contract CRUD routes under the prefix
 * configured in protectedRoutes (e.g. /api/contracts).
 *
 * All routes are protected by verifyAccessToken via the protectedRoutes
 * plugin-level hook — no additional auth setup needed here.
 *
 * RBAC:
 *   GET  /           → ADMIN + TREASURER
 *   GET  /:id        → ADMIN + TREASURER
 *   POST /           → ADMIN only
 *   PUT  /:id        → ADMIN only
 */
export async function contractRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/contracts
   * Returns a paginated, filterable list of contracts for the authenticated club.
   * Supports filters: ?athleteId=&status=&page=&limit=
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
   * Returns a single contract by id.
   * Accessible by both ADMIN and TREASURER.
   */
  fastify.get("/:contractId", async (request, reply) => {
    const { contractId } = request.params as { contractId: string };
    const user = request.user as AccessTokenPayload;

    try {
      const contract = await getContractById(
        fastify.prisma,
        user.clubId,
        contractId,
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
   * Creates a new contract for an athlete in the authenticated club.
   * Restricted to ADMIN role.
   *
   * Returns:
   *   201 — created contract
   *   400 — invalid body
   *   403 — insufficient role (TREASURER)
   *   404 — athlete not found
   *   409 — athlete already has an ACTIVE contract
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
   * Partially updates a contract.
   * Mutable fields: status, endDate, bidRegistered, federationCode, notes.
   * athleteId and type are immutable post-creation — excluded from schema.
   *
   * Transitioning status to TERMINATED is permanent.
   * Restricted to ADMIN role.
   *
   * Returns:
   *   200 — updated contract
   *   400 — invalid body
   *   403 — insufficient role (TREASURER)
   *   404 — contract not found
   *   409 — setting status=ACTIVE when another active contract exists
   *   422 — attempting to modify an already TERMINATED contract
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
        const contract = await updateContract(
          fastify.prisma,
          user.clubId,
          request.actorId,
          contractId,
          parsed.data,
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
