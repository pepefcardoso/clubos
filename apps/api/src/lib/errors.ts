/**
 * Base class for all application-layer errors in ClubOS.
 *
 * Subclasses set `isOperational = true` for errors that represent valid
 * business outcomes (auth failure, not found, conflict). Sentry captures
 * only non-operational errors — those indicate programmer mistakes or
 * infrastructure failures that require attention.
 *
 * HTTP status is carried here so the Fastify error handler can map it
 * without instanceof chains.
 */
export class AppError extends Error {
  /** HTTP status code to return to the client. */
  readonly statusCode: number;
  /**
   * true  → expected business error (4xx). Do NOT send to Sentry.
   * false → unexpected error (5xx or programmer bug). SEND to Sentry.
   */
  readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational: boolean) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autorizado.") {
    super(message, 401, true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado.") {
    super(message, 403, true);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado.") {
    super(message, 404, true);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflito de dados.") {
    super(message, 409, true);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Dados inválidos.") {
    super(message, 422, true);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Muitas requisições. Tente novamente em instantes.") {
    super(message, 429, true);
  }
}
