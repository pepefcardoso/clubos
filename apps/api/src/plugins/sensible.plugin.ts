import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError } from "fastify";
import { AppError } from "../lib/errors.js";

const isProduction = process.env["NODE_ENV"] === "production";

/**
 * Maps a 4xx status code to a safe, generic Portuguese message for production.
 * In development/test the original error message passes through unchanged.
 */
function genericMessageFor(statusCode: number): string {
  const messages: Record<number, string> = {
    400: "Dados inválidos.",
    401: "Não autorizado.",
    403: "Acesso negado.",
    404: "Recurso não encontrado.",
    409: "Conflito de dados.",
    422: "Dados inválidos.",
    429: "Muitas requisições. Tente novamente.",
  };
  return messages[statusCode] ?? "Erro na requisição.";
}

async function sensiblePlugin(fastify: FastifyInstance): Promise<void> {
  fastify.setErrorHandler((unknownError, _request, reply) => {
    const error = unknownError as FastifyError;

    fastify.log.error(error);

    if (error.statusCode === 413) {
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

    if (error instanceof AppError) {
      const statusCode = error.statusCode;
      return reply.status(statusCode).send({
        statusCode,
        error: error.name,
        message: isProduction ? genericMessageFor(statusCode) : error.message,
      });
    }

    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      return reply.status(statusCode).send({
        statusCode,
        error: "Internal Server Error",
        message: isProduction
          ? "Ocorreu um erro inesperado. Nossa equipe foi notificada."
          : error.message,
      });
    }

    return reply.status(statusCode).send({
      statusCode,
      error: error.name ?? "Error",
      message: isProduction ? genericMessageFor(statusCode) : error.message,
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
