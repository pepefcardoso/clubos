import type { FastifyInstance } from "fastify";
import type { AccessTokenPayload } from "../../../types/fastify.js";
import {
  VideoParamsSchema,
  VideoIdParamsSchema,
  ReorderVideosSchema,
} from "./videos.schema.js";
import {
  uploadAthleteVideo,
  deleteAthleteVideo,
  reorderAthleteVideos,
  VideoLimitExceededError,
  VideoTooLargeError,
  InvalidVideoTypeError,
  VideoNotFoundError,
} from "./videos.service.js";
import {
  VideoDurationExceededError,
  VideoProbeError,
} from "../../../lib/ffprobe.js";
import { NotFoundError, ValidationError } from "../../../lib/errors.js";

export async function videoRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/athletes/:athleteId/videos
   * Authorization: ADMIN only.
   * Content-Type: multipart/form-data (field: "video").
   * Per-route fileSize override: 100 MB (global plugin limit is 5 MB for logos).
   */
  fastify.post(
    "/:athleteId/videos",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parseResult = VideoParamsSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message ?? "Invalid params",
        });
      }
      const { athleteId } = parseResult.data;
      const user = request.user as AccessTokenPayload;

      if (!user.clubId) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Token inválido.",
        });
      }

      let data;
      try {
        data = await request.file({ limits: { fileSize: 100 * 1024 * 1024 } });
      } catch (err) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 413) {
          return reply.status(413).send({
            statusCode: 413,
            error: "Payload Too Large",
            message: "Arquivo excede o limite de 100 MB.",
          });
        }
        throw err;
      }

      if (!data) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Nenhum vídeo enviado.",
        });
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (err) {
        const e = err as { statusCode?: number };
        if (e.statusCode === 413) {
          return reply.status(413).send({
            statusCode: 413,
            error: "Payload Too Large",
            message: "Arquivo excede o limite de 100 MB.",
          });
        }
        throw err;
      }

      try {
        const result = await uploadAthleteVideo(
          fastify.prisma,
          user.clubId,
          athleteId,
          buffer,
          data.mimetype,
        );
        return reply.status(201).send(result);
      } catch (err) {
        if (err instanceof VideoLimitExceededError)
          return reply
            .status(409)
            .send({ statusCode: 409, error: "Conflict", message: err.message });
        if (err instanceof InvalidVideoTypeError)
          return reply.status(415).send({
            statusCode: 415,
            error: "Unsupported Media Type",
            message: err.message,
          });
        if (err instanceof VideoDurationExceededError)
          return reply.status(422).send({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: err.message,
          });
        if (err instanceof VideoProbeError)
          return reply.status(422).send({
            statusCode: 422,
            error: "Unprocessable Entity",
            message: err.message,
          });
        if (err instanceof VideoTooLargeError)
          return reply.status(413).send({
            statusCode: 413,
            error: "Payload Too Large",
            message: err.message,
          });
        if (err instanceof NotFoundError)
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        throw err;
      }
    },
  );

  /**
   * DELETE /api/athletes/:athleteId/videos/:videoId
   * Authorization: ADMIN only.
   */
  fastify.delete(
    "/:athleteId/videos/:videoId",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const parseResult = VideoIdParamsSchema.safeParse(request.params);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parseResult.error.issues[0]?.message ?? "Invalid params",
        });
      }
      const { athleteId, videoId } = parseResult.data;
      const user = request.user as AccessTokenPayload;

      if (!user.clubId) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Token inválido.",
        });
      }

      try {
        await deleteAthleteVideo(
          fastify.prisma,
          user.clubId,
          athleteId,
          videoId,
        );
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof VideoNotFoundError || err instanceof NotFoundError)
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        throw err;
      }
    },
  );

  /**
   * PATCH /api/athletes/:athleteId/videos/reorder
   * Authorization: ADMIN only.
   * Body: { orderedIds: string[] }
   */
  fastify.patch(
    "/:athleteId/videos/reorder",
    { preHandler: [fastify.requireRole("ADMIN")] },
    async (request, reply) => {
      const paramsResult = VideoParamsSchema.safeParse(request.params);
      const bodyResult = ReorderVideosSchema.safeParse(request.body);

      if (!paramsResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: paramsResult.error.issues[0]?.message ?? "Invalid params",
        });
      }
      if (!bodyResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: bodyResult.error.issues[0]?.message ?? "Invalid body",
        });
      }

      const { athleteId } = paramsResult.data;
      const { orderedIds } = bodyResult.data;
      const user = request.user as AccessTokenPayload;
      if (!user.clubId) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Token inválido.",
        });
      }

      try {
        const result = await reorderAthleteVideos(
          fastify.prisma,
          user.clubId,
          athleteId,
          orderedIds,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof NotFoundError)
          return reply.status(404).send({
            statusCode: 404,
            error: "Not Found",
            message: err.message,
          });
        if (err instanceof ValidationError)
          return reply.status(400).send({
            statusCode: 400,
            error: "Bad Request",
            message: err.message,
          });
        throw err;
      }
    },
  );
}
