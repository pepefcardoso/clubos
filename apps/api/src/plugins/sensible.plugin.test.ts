import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import type { FastifySchemaValidationError } from "fastify/types/schema.js";
import sensiblePlugin, {
  buildErrorResponse,
  genericClientMessage,
} from "../plugins/sensible.plugin.js";
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
} from "../lib/errors.js";

/**
 * Creates a FastifyError-shaped object for throwing inside a route.
 */
function makeError(
  message: string,
  overrides: Partial<{
    statusCode: number;
    name: string;
    validation: FastifySchemaValidationError[];
    cause: unknown;
  }> = {},
): FastifyError {
  const err = new Error(message) as FastifyError;
  if (overrides.statusCode !== undefined) err.statusCode = overrides.statusCode;
  if (overrides.name !== undefined) err.name = overrides.name;
  if (overrides.validation !== undefined) err.validation = overrides.validation;
  if (overrides.cause !== undefined)
    (err as Error & { cause: unknown }).cause = overrides.cause;
  return err;
}

async function buildApp(
  nodeEnv: "development" | "production" | "test",
): Promise<FastifyInstance> {
  const savedEnv = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = nodeEnv;

  const fastify = Fastify({ logger: false });
  await fastify.register(sensiblePlugin);

  fastify.get("/throw-500", async () => {
    throw new Error("Database connection refused at 10.0.0.1:5432");
  });

  fastify.get("/throw-cause", async () => {
    const inner = new Error("inner secret detail at /srv/app/src/db.ts:88");
    const outer = new Error("outer wrapper") as FastifyError;
    (outer as Error & { cause: unknown }).cause = inner;
    throw outer;
  });

  fastify.get("/throw-stack", async () => {
    const err = new Error("stack leak") as FastifyError;
    err.stack =
      "Error: stack leak\n    at secret/path/internal-module.ts:42:9\n    at sensitive/route.ts:17:3";
    throw err;
  });

  fastify.get("/throw-500-explicit", async () => {
    throw makeError("explicit 500 message", { statusCode: 500 });
  });

  fastify.get("/throw-401", async () => {
    throw new UnauthorizedError();
  });

  fastify.get("/throw-403", async () => {
    throw new ForbiddenError();
  });

  fastify.get("/throw-404", async () => {
    throw new NotFoundError();
  });

  fastify.get("/throw-409", async () => {
    throw new ConflictError("CPF já cadastrado.");
  });

  fastify.get("/throw-422", async () => {
    throw new ValidationError("Dados inválidos no campo email.");
  });

  fastify.get("/throw-429", async () => {
    throw new TooManyRequestsError();
  });

  fastify.get("/throw-infra", async () => {
    throw new AppError("DB connection lost", 500, false);
  });

  fastify.get("/throw-validation", async () => {
    const err = makeError('body/email must match format "email"', {
      statusCode: 400,
      validation: [
        {
          instancePath: "/email",
          schemaPath: "#/properties/email/format",
          keyword: "format",
          params: { format: "email" },
          message: 'must match format "email"',
        },
      ],
    });
    throw err;
  });

  fastify.get("/throw-413", async () => {
    throw makeError("Request file too large", { statusCode: 413 });
  });

  fastify.get("/throw-plain-404", async () => {
    throw makeError("Resource not found", {
      statusCode: 404,
      name: "NotFoundError",
    });
  });

  fastify.get("/ok", async () => ({ ok: true }));

  await fastify.ready();

  process.env["NODE_ENV"] = savedEnv;
  return fastify;
}

describe("buildErrorResponse() — pure function", () => {
  it("returns the generic 5xx message in production for statusCode 500", () => {
    const r = buildErrorResponse(
      500,
      "Internal Server Error",
      "secret detail",
      true,
    );
    expect(r.message).toBe(
      "Ocorreu um erro inesperado. Nossa equipe foi notificada.",
    );
  });

  it("returns the original message in development for statusCode 500", () => {
    const r = buildErrorResponse(
      500,
      "Internal Server Error",
      "secret detail",
      false,
    );
    expect(r.message).toBe("secret detail");
  });

  it("returns the provided message for 4xx in development", () => {
    const r = buildErrorResponse(
      401,
      "Unauthorized",
      "Invalid credentials",
      false,
    );
    expect(r.message).toBe("Invalid credentials");
  });

  it("returns the provided message for 4xx in production (sanitisation done upstream)", () => {
    const r = buildErrorResponse(401, "Unauthorized", "Não autorizado.", true);
    expect(r.message).toBe("Não autorizado.");
  });

  it("always includes statusCode and error name in the output", () => {
    const r = buildErrorResponse(422, "ValidationError", "bad field", false);
    expect(r.statusCode).toBe(422);
    expect(r.error).toBe("ValidationError");
  });

  it("response object has exactly three keys", () => {
    const r = buildErrorResponse(500, "Internal Server Error", "msg", true);
    expect(Object.keys(r).sort()).toEqual(["error", "message", "statusCode"]);
  });

  it("applies the generic message for statusCode 503 in production", () => {
    const r = buildErrorResponse(
      503,
      "Service Unavailable",
      "downstream timeout",
      true,
    );
    expect(r.message).toBe(
      "Ocorreu um erro inesperado. Nossa equipe foi notificada.",
    );
  });
});

describe("genericClientMessage()", () => {
  const cases: [number, string][] = [
    [400, "Dados inválidos."],
    [401, "Não autorizado."],
    [403, "Acesso negado."],
    [404, "Recurso não encontrado."],
    [409, "Conflito de dados."],
    [422, "Dados inválidos."],
    [429, "Muitas requisições. Tente novamente."],
  ];

  for (const [code, expected] of cases) {
    it(`maps ${code} → "${expected}"`, () => {
      expect(genericClientMessage(code)).toBe(expected);
    });
  }

  it("returns a fallback for unknown status codes", () => {
    expect(genericClientMessage(418)).toBe("Erro na requisição.");
  });
});

describe("setErrorHandler — development environment", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("development");
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 500 for an unexpected error", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(res.statusCode).toBe(500);
  });

  it("exposes the original error.message in development (DX preserved)", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(res.json().message).toContain("Database connection refused");
  });

  it("returns error: 'Internal Server Error' for 5xx", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(res.json().error).toBe("Internal Server Error");
  });

  it("returns the AppError message for 401 in development", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-401" });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Não autorizado.");
  });

  it("returns the AppError message for 404 in development", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-404" });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Recurso não encontrado.");
  });

  it("returns the specific ConflictError message in development", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-409" });
    expect(res.json().message).toBe("CPF já cadastrado.");
  });

  it("returns the Ajv message detail for validation errors in development", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-validation" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/email/);
  });

  it("maps 413 → 400 with safe hardcoded message in development", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-413" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Arquivo excede o limite de 5 MB");
  });

  it("does not interfere with successful responses", async () => {
    const res = await app.inject({ method: "GET", url: "/ok" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("setErrorHandler — production environment [L-12 critical]", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("production");
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns exactly the generic message for 500 in production", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe(
      "Ocorreu um erro inesperado. Nossa equipe foi notificada.",
    );
  });

  it("does NOT include the original error.message in the response body", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    const raw = res.payload;
    expect(raw).not.toMatch(/Database connection/);
    expect(raw).not.toMatch(/10\.0\.0\.1/);
  });

  it("response body does NOT contain a 'stack' key", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-stack" });
    expect(res.json()).not.toHaveProperty("stack");
  });

  it("stack trace path is NOT present anywhere in the response payload", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-stack" });
    expect(res.payload).not.toMatch(/secret\/path\/internal-module/);
    expect(res.payload).not.toMatch(/sensitive\/route/);
  });

  it("response body does NOT contain a 'cause' key", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-cause" });
    expect(res.json()).not.toHaveProperty("cause");
  });

  it("error.cause message is NOT present anywhere in the response payload", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-cause" });
    expect(res.payload).not.toMatch(/inner secret detail/);
    expect(res.payload).not.toMatch(/db\.ts:88/);
  });

  it("explicit statusCode: 500 also receives the generic message", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500-explicit" });
    expect(res.json().message).toBe(
      "Ocorreu um erro inesperado. Nossa equipe foi notificada.",
    );
    expect(res.payload).not.toMatch(/explicit 500 message/);
  });

  it("non-operational AppError (500) returns generic message in production", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-infra" });
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toBe(
      "Ocorreu um erro inesperado. Nossa equipe foi notificada.",
    );
    expect(res.payload).not.toMatch(/DB connection lost/);
  });

  it("AppError 401: returns generic Não autorizado message", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-401" });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe("Não autorizado.");
  });

  it("AppError 403: returns generic Acesso negado message", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-403" });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toBe("Acesso negado.");
  });

  it("AppError 404: returns generic Recurso não encontrado message", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-404" });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toBe("Recurso não encontrado.");
  });

  it("ConflictError with specific message: specific text NOT in production response", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-409" });
    expect(res.statusCode).toBe(409);
    expect(res.payload).not.toMatch(/CPF já cadastrado/);
    expect(res.json().message).toBe("Conflito de dados.");
  });

  it("ValidationError with specific field message: field detail NOT in production response", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-422" });
    expect(res.statusCode).toBe(422);
    expect(res.payload).not.toMatch(/campo email/);
    expect(res.json().message).toBe("Dados inválidos.");
  });

  it("TooManyRequestsError: returns generic 429 message", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-429" });
    expect(res.statusCode).toBe(429);
    expect(res.json().message).toBe("Muitas requisições. Tente novamente.");
  });

  it("validation error in production: returns 'Dados inválidos.' not Ajv detail", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-validation" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Dados inválidos.");
    expect(res.payload).not.toMatch(/format/);
    expect(res.payload).not.toMatch(/email.*format|format.*email/);
  });

  it("413 → 400 with safe hardcoded message in production (not generic 500 msg)", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-413" });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Arquivo excede o limite de 5 MB");
    expect(res.json().message).not.toMatch(/Nossa equipe foi notificada/);
  });

  it("500 response body has exactly three keys: statusCode, error, message", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(Object.keys(res.json()).sort()).toEqual([
      "error",
      "message",
      "statusCode",
    ]);
  });

  it("401 response body has exactly three keys", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-401" });
    expect(Object.keys(res.json()).sort()).toEqual([
      "error",
      "message",
      "statusCode",
    ]);
  });

  it("validation response body has exactly three keys", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-validation" });
    expect(Object.keys(res.json()).sort()).toEqual([
      "error",
      "message",
      "statusCode",
    ]);
  });

  it("500 response body does NOT have a 'trace' key", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(res.json()).not.toHaveProperty("trace");
  });
});

describe("setNotFoundHandler", () => {
  let devApp: FastifyInstance;
  let prodApp: FastifyInstance;

  beforeEach(async () => {
    devApp = await buildApp("development");
    prodApp = await buildApp("production");
  });

  afterEach(async () => {
    await devApp.close();
    await prodApp.close();
  });

  it("returns HTTP 404 for unregistered routes (dev)", async () => {
    const res = await devApp.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("returns correct 404 shape in development", async () => {
    const res = await devApp.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.json()).toEqual({
      statusCode: 404,
      error: "Not Found",
      message: "Route not found.",
    });
  });

  it("returns HTTP 404 for unregistered routes (production)", async () => {
    const res = await prodApp.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("returns correct 404 shape in production (static — no env branching needed)", async () => {
    const res = await prodApp.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.json()).toEqual({
      statusCode: 404,
      error: "Not Found",
      message: "Route not found.",
    });
  });

  it("triggers for different HTTP methods on unregistered routes", async () => {
    const methods = ["POST", "PUT", "DELETE", "PATCH"] as const;
    for (const method of methods) {
      const res = await devApp.inject({ method, url: "/no-such-route" });
      expect(res.statusCode).toBe(404);
    }
  });
});

describe("Response shape invariants — body never leaks internals", () => {
  const environments = ["development", "production"] as const;

  for (const env of environments) {
    describe(`environment: ${env}`, () => {
      let app: FastifyInstance;

      beforeEach(async () => {
        app = await buildApp(env);
      });

      afterEach(async () => {
        await app.close();
      });

      it("200 response is unaffected by the error handler", async () => {
        const res = await app.inject({ method: "GET", url: "/ok" });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
      });

      it("error response body never has a 'stack' key", async () => {
        const res = await app.inject({ method: "GET", url: "/throw-500" });
        expect(res.json()).not.toHaveProperty("stack");
      });

      it("error response body never has a 'cause' key", async () => {
        const res = await app.inject({ method: "GET", url: "/throw-cause" });
        expect(res.json()).not.toHaveProperty("cause");
      });

      it("error response body never has a 'trace' key", async () => {
        const res = await app.inject({ method: "GET", url: "/throw-500" });
        expect(res.json()).not.toHaveProperty("trace");
      });

      it("413 → 400 uses safe hardcoded message in all environments", async () => {
        const res = await app.inject({ method: "GET", url: "/throw-413" });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toBe("Arquivo excede o limite de 5 MB");
      });
    });
  }
});

describe("setErrorHandler — error name mapping (development)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("development");
  });

  afterEach(async () => {
    await app.close();
  });

  it("uses 'Internal Server Error' as error name for 5xx", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(res.json().error).toBe("Internal Server Error");
  });

  it("uses error.name for 4xx plain errors", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-plain-404" });
    expect(res.json().error).toBe("NotFoundError");
  });

  it("uses AppError.name for AppError subclasses", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-401" });
    expect(res.json().error).toBe("UnauthorizedError");
  });

  it("statusCode echoes back in body for 4xx", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-422" });
    expect(res.json().statusCode).toBe(422);
  });
});

describe("Error responses return JSON content-type", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("production");
  });

  afterEach(async () => {
    await app.close();
  });

  it("500 response has application/json content-type", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-500" });
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it("401 response has application/json content-type", async () => {
    const res = await app.inject({ method: "GET", url: "/throw-401" });
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
