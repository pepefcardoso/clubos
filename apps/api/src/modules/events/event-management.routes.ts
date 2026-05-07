import type { FastifyInstance } from "fastify";
import {
  CreateEventSchema,
  UpdateEventSchema,
  ListEventsQuerySchema,
} from "./event-management.schema.js";
import {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  cancelEvent,
  uploadEventSponsorLogo,
  EventNotFoundError,
  EventAlreadyCancelledError,
  InvalidSponsorLogoError,
} from "./event-management.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

export async function eventManagementRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = CreateEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const event = await createEvent(fastify.prisma, clubId, parsed.data);
      return reply.status(201).send(event);
    },
  );

  fastify.get(
    "/",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parsed = ListEventsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid query params",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;
      const result = await listEvents(fastify.prisma, clubId, parsed.data);
      return reply.status(200).send(result);
    },
  );

  fastify.get(
    "/:eventId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        const event = await getEventById(fastify.prisma, clubId, eventId);
        return reply.status(200).send(event);
      } catch (err) {
        if (err instanceof EventNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Evento não encontrado",
          });
        }
        throw err;
      }
    },
  );

  fastify.put(
    "/:eventId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };

      const parsed = UpdateEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues[0]?.message ?? "Invalid input",
        });
      }

      const { clubId } = request.user as AccessTokenPayload;

      try {
        const event = await updateEvent(
          fastify.prisma,
          clubId,
          eventId,
          parsed.data,
        );
        return reply.status(200).send(event);
      } catch (err) {
        if (err instanceof EventNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Evento não encontrado",
          });
        }
        throw err;
      }
    },
  );

  fastify.delete(
    "/:eventId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const { clubId } = request.user as AccessTokenPayload;

      try {
        await cancelEvent(fastify.prisma, clubId, eventId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof EventNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Evento não encontrado",
          });
        }
        if (err instanceof EventAlreadyCancelledError) {
          return reply.status(409).send({
            statusCode: 409,
            error: "Conflict",
            message: "Evento já foi cancelado",
          });
        }
        throw err;
      }
    },
  );

  fastify.post(
    "/:eventId/sponsor-logo",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const { clubId } = request.user as AccessTokenPayload;

      let data;
      try {
        data = await request.file();
      } catch (err) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 413) {
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
          message: "Nenhuma imagem enviada",
        });
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (err) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 413) {
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: "Arquivo excede o limite de 5 MB",
          });
        }
        throw err;
      }

      try {
        const result = await uploadEventSponsorLogo(
          fastify.prisma,
          clubId,
          eventId,
          data.mimetype,
          buffer,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof EventNotFoundError) {
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: "Evento não encontrado",
          });
        }
        if (err instanceof InvalidSponsorLogoError) {
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
