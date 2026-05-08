import type { FastifyInstance } from "fastify";
import { assertClubBelongsToUser } from "../../../lib/assert-tenant-ownership.js";
import { assertPosProductExists } from "../../../lib/assert-tenant-ownership.js";
import { NotFoundError } from "../../../lib/errors.js";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import {
  CreatePosProductSchema,
  UpdatePosProductSchema,
  ListPosProductsQuerySchema,
} from "./products.schema.js";
import {
  listPosProducts,
  createPosProduct,
  updatePosProduct,
  deletePosProduct,
  PosProductNotFoundError,
  DuplicatePosProductNameError,
} from "./products.service.js";

export async function posProductRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /api/clubs/:clubId/pos-products
   * Authorization: ADMIN or TREASURER
   */
  fastify.get<{ Params: { clubId: string } }>(
    "/:clubId/pos-products",
    { preHandler: [fastify.requireRole("ADMIN", "TREASURER")] },
    async (request, reply) => {
      const { clubId } = request.params;
      const { clubId: authClubId } = request.user as AccessTokenPayload;

      try {
        await assertClubBelongsToUser(fastify.prisma, clubId, authClubId);
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Clube não encontrado.",
        });
      }

      const parsed = ListPosProductsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Query inválida.",
        });
      }

      const result = await listPosProducts(fastify.prisma, clubId, parsed.data);
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/clubs/:clubId/pos-products
   * Authorization: ADMIN
   */
  fastify.post<{ Params: { clubId: string } }>(
    "/:clubId/pos-products",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId } = request.params;
      const { clubId: authClubId } = request.user as AccessTokenPayload;

      try {
        await assertClubBelongsToUser(fastify.prisma, clubId, authClubId);
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Clube não encontrado.",
        });
      }

      const parsed = CreatePosProductSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      try {
        const product = await createPosProduct(
          fastify.prisma,
          clubId,
          parsed.data,
        );
        return reply.status(201).send(product);
      } catch (err) {
        if (err instanceof DuplicatePosProductNameError) {
          return reply
            .status(409)
            .send({ statusCode: 409, error: "Conflict", message: err.message });
        }
        throw err;
      }
    },
  );

  /**
   * PUT /api/clubs/:clubId/pos-products/:productId
   * Authorization: ADMIN
   */
  fastify.put<{ Params: { clubId: string; productId: string } }>(
    "/:clubId/pos-products/:productId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId, productId } = request.params;
      const { clubId: authClubId } = request.user as AccessTokenPayload;

      try {
        await assertClubBelongsToUser(fastify.prisma, clubId, authClubId);
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Clube não encontrado.",
        });
      }

      try {
        const { withTenantSchema } = await import("../../../lib/prisma.js");
        await withTenantSchema(fastify.prisma, clubId, async (tx) => {
          await assertPosProductExists(tx, productId);
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }

      const parsed = UpdatePosProductSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
        });
      }

      try {
        const product = await updatePosProduct(
          fastify.prisma,
          clubId,
          productId,
          parsed.data,
        );
        return reply.status(200).send(product);
      } catch (err) {
        if (err instanceof PosProductNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        if (err instanceof DuplicatePosProductNameError) {
          return reply
            .status(409)
            .send({ statusCode: 409, error: "Conflict", message: err.message });
        }
        throw err;
      }
    },
  );

  /**
   * DELETE /api/clubs/:clubId/pos-products/:productId
   * Authorization: ADMIN — soft-delete only (preserves pos_sales history)
   */
  fastify.delete<{ Params: { clubId: string; productId: string } }>(
    "/:clubId/pos-products/:productId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { clubId, productId } = request.params;
      const { clubId: authClubId } = request.user as AccessTokenPayload;

      try {
        await assertClubBelongsToUser(fastify.prisma, clubId, authClubId);
      } catch {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Clube não encontrado.",
        });
      }

      try {
        const { withTenantSchema } = await import("../../../lib/prisma.js");
        await withTenantSchema(fastify.prisma, clubId, async (tx) => {
          await assertPosProductExists(tx, productId);
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }

      try {
        await deletePosProduct(fastify.prisma, clubId, productId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof PosProductNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        }
        throw err;
      }
    },
  );
}
