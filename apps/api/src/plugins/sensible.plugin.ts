import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError } from "fastify";
import { AppError } from "../lib/errors.js";

/**
 * Builds a sanitised HTTP error response payload.
 *
 * Single invariant: statusCode >= 500 in production → always generic message.
 * stack, cause, and internal Ajv/Prisma details are NEVER included in the
 * response body under any circumstances — only in server-side logs.
 */
export function buildErrorResponse(
  statusCode: number,
  errorName: string,
  message: string,
  isProduction: boolean,
): { statusCode: number; error: string; message: string } {
  return {
    statusCode,
    error: errorName,
    message:
      statusCode >= 500 && isProduction
        ? "Ocorreu um erro inesperado. Nossa equipe foi notificada."
        : message,
  };
}

/**
 * Maps a status code to a safe, generic Portuguese message.
 * Used for 4xx responses in production to prevent leaking schema internals,
 * Prisma field names, Ajv path details, or operational business messages
 * that could aid an attacker in mapping the API surface.
 */
export function genericClientMessage(statusCode: number): string {
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
  const isProduction = process.env["NODE_ENV"] === "production";

  fastify.setErrorHandler((unknownError, _request, reply) => {
    const error = unknownError as FastifyError;

    fastify.log.error(error);

    if (error.statusCode === 413) {
      return reply
        .status(400)
        .send(
          buildErrorResponse(
            400,
            "Bad Request",
            "Arquivo excede o limite de 5 MB",
            isProduction,
          ),
        );
    }

    if (error.validation) {
      return reply
        .status(400)
        .send(
          buildErrorResponse(
            400,
            "Bad Request",
            isProduction ? genericClientMessage(400) : error.message,
            isProduction,
          ),
        );
    }

    if (error instanceof AppError) {
      const { statusCode } = error;
      return reply
        .status(statusCode)
        .send(
          buildErrorResponse(
            statusCode,
            error.name,
            isProduction ? genericClientMessage(statusCode) : error.message,
            isProduction,
          ),
        );
    }

    const statusCode = error.statusCode ?? 500;

    const errorName =
      statusCode >= 500 ? "Internal Server Error" : (error.name ?? "Error");

    const devMessage = error.message;
    const prodMessage =
      statusCode >= 500
        ? "Ocorreu um erro inesperado. Nossa equipe foi notificada."
        : genericClientMessage(statusCode);

    return reply
      .status(statusCode)
      .send(
        buildErrorResponse(
          statusCode,
          errorName,
          isProduction ? prodMessage : devMessage,
          isProduction,
        ),
      );
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
