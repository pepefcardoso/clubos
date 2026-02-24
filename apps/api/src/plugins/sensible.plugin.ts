import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError } from "fastify";

async function sensiblePlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((unknownError, _request, reply) => {
    const error = unknownError as FastifyError;
    let statusCode = error.statusCode ?? 500;

    fastify.log.error(error);

    if (statusCode === 413) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Arquivo excede o limite de 5 MB",
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: error.message,
      });
    }

    return reply.status(statusCode).send({
      statusCode,
      error:
        statusCode === 500 ? "Internal Server Error" : (error.name ?? "Error"),
      message:
        statusCode === 500 ? "An unexpected error occurred." : error.message,
    });
  });

  fastify.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "Route not found.",
    });
  });
}

export default fp(sensiblePlugin, {
  name: "sensible",
  fastify: "5.x",
});
