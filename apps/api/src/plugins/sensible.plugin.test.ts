import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import type { FastifySchemaValidationError } from "fastify/types/schema.js";
import sensiblePlugin from "../plugins/sensible.plugin.js";

/**
 * Creates a FastifyError-shaped object suitable for throwing inside a route.
 * We cannot use new Error() alone because sensiblePlugin reads `.statusCode`
 * and `.validation` off the thrown value via `unknownError as FastifyError`.
 */
function makeError(
  message: string,
  overrides: Partial<{
    statusCode: number;
    name: string;
    validation: FastifySchemaValidationError[];
  }> = {},
): FastifyError {
  const err = new Error(message) as FastifyError;
  if (overrides.statusCode !== undefined) err.statusCode = overrides.statusCode;
  if (overrides.name !== undefined) err.name = overrides.name;
  if (overrides.validation !== undefined) err.validation = overrides.validation;
  return err;
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  await fastify.register(sensiblePlugin);

  fastify.get("/error/413", async () => {
    throw makeError("Request body too large", { statusCode: 413 });
  });

  fastify.get("/error/validation", async () => {
    throw makeError("body/name must be a string", {
      statusCode: 400,
      validation: [
        {
          instancePath: "/name",
          schemaPath: "#/properties/name/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be a string",
        },
      ],
    });
  });

  fastify.get("/error/500", async () => {
    throw new Error("something exploded internally");
  });

  fastify.get("/error/500-explicit", async () => {
    throw makeError("explicit internal error", { statusCode: 500 });
  });

  fastify.get("/error/422", async () => {
    throw makeError("Unprocessable entity", {
      statusCode: 422,
      name: "UnprocessableEntityError",
    });
  });

  fastify.get("/error/404-manual", async () => {
    throw makeError("Resource not found", {
      statusCode: 404,
      name: "NotFoundError",
    });
  });

  fastify.get("/ok", async () => ({ ok: true }));

  await fastify.ready();
  return fastify;
}

describe("sensiblePlugin — setErrorHandler", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("maps a 413 error to HTTP 400", async () => {
    const res = await app.inject({ method: "GET", url: "/error/413" });
    expect(res.statusCode).toBe(400);
  });

  it("413 → 400 response body has statusCode: 400", async () => {
    const res = await app.inject({ method: "GET", url: "/error/413" });
    expect(res.json().statusCode).toBe(400);
  });

  it("413 → 400 response body has error: 'Bad Request'", async () => {
    const res = await app.inject({ method: "GET", url: "/error/413" });
    expect(res.json().error).toBe("Bad Request");
  });

  it("413 → 400 response body has the expected Portuguese message", async () => {
    const res = await app.inject({ method: "GET", url: "/error/413" });
    expect(res.json().message).toBe("Arquivo excede o limite de 5 MB");
  });

  it("maps a validation error to HTTP 400", async () => {
    const res = await app.inject({ method: "GET", url: "/error/validation" });
    expect(res.statusCode).toBe(400);
  });

  it("validation error body has error: 'Bad Request'", async () => {
    const res = await app.inject({ method: "GET", url: "/error/validation" });
    expect(res.json().error).toBe("Bad Request");
  });

  it("validation error body forwards the original error message", async () => {
    const res = await app.inject({ method: "GET", url: "/error/validation" });
    expect(res.json().message).toBe("body/name must be a string");
  });

  it("returns HTTP 500 for errors without a statusCode", async () => {
    const res = await app.inject({ method: "GET", url: "/error/500" });
    expect(res.statusCode).toBe(500);
  });

  it("500 response body has error: 'Internal Server Error'", async () => {
    const res = await app.inject({ method: "GET", url: "/error/500" });
    expect(res.json().error).toBe("Internal Server Error");
  });

  it("500 response body uses the generic message, not the internal one", async () => {
    const res = await app.inject({ method: "GET", url: "/error/500" });
    expect(res.json().message).toBe("An unexpected error occurred.");
  });

  it("explicit statusCode: 500 also receives the generic message", async () => {
    const res = await app.inject({ method: "GET", url: "/error/500-explicit" });
    expect(res.json().message).toBe("An unexpected error occurred.");
  });

  it("passes through the statusCode for non-500 errors", async () => {
    const res = await app.inject({ method: "GET", url: "/error/422" });
    expect(res.statusCode).toBe(422);
  });

  it("non-500 response body echoes statusCode", async () => {
    const res = await app.inject({ method: "GET", url: "/error/422" });
    expect(res.json().statusCode).toBe(422);
  });

  it("non-500 response body uses error.name when available", async () => {
    const res = await app.inject({ method: "GET", url: "/error/422" });
    expect(res.json().error).toBe("UnprocessableEntityError");
  });

  it("non-500 response body forwards error.message", async () => {
    const res = await app.inject({ method: "GET", url: "/error/422" });
    expect(res.json().message).toBe("Unprocessable entity");
  });

  it("falls back to 'Error' for error.name when name is not set", async () => {
    const res = await app.inject({ method: "GET", url: "/error/404-manual" });
    expect(res.json().error).toBe("NotFoundError");
  });

  it("does not interfere with successful responses", async () => {
    const res = await app.inject({ method: "GET", url: "/ok" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("sensiblePlugin — setNotFoundHandler", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns HTTP 404 for unregistered routes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/definitely-not-here",
    });
    expect(res.statusCode).toBe(404);
  });

  it("404 body has statusCode: 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/definitely-not-here",
    });
    expect(res.json().statusCode).toBe(404);
  });

  it("404 body has error: 'Not Found'", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/definitely-not-here",
    });
    expect(res.json().error).toBe("Not Found");
  });

  it("404 body has the expected message", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/definitely-not-here",
    });
    expect(res.json().message).toBe("Route not found.");
  });

  it("404 triggers for different HTTP methods on unregistered routes", async () => {
    const methods = ["POST", "PUT", "DELETE", "PATCH"] as const;
    for (const method of methods) {
      const res = await app.inject({ method, url: "/no-such-route" });
      expect(res.statusCode).toBe(404);
    }
  });
});
