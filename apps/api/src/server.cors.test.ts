/**
 * Integration tests for CORS behaviour in apps/api/src/server.ts.
 *
 * These tests build a minimal Fastify instance that mirrors only the CORS
 * registration logic from buildApp(). This avoids spinning up a real DB,
 * Redis, or BullMQ — making the suite fast and fully self-contained.
 *
 * Coverage:
 *   - Production allow-list: listed https:// origins are allowed.
 *   - Production allow-list: unlisted origins are rejected (no ACAO header).
 *   - Preflight (OPTIONS) works for listed origins.
 *   - Access-Control-Allow-Credentials: true is always present for listed origins.
 *   - Requests with no Origin header always succeed (same-origin / non-browser).
 *   - Development: all origins are reflected regardless of the allow-list.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";

type NodeEnv = "production" | "development" | "test";

/**
 * Builds a minimal Fastify instance that mirrors the CORS registration from
 * buildApp() without any database, Redis, or BullMQ dependencies.
 *
 * @param allowedOrigins - The pre-parsed list of allowed origins (may be empty).
 * @param nodeEnv        - Simulated NODE_ENV value.
 */
async function buildCorsTestApp(
  allowedOrigins: string[],
  nodeEnv: NodeEnv,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (nodeEnv !== "production") return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);

      app.log.warn(
        { origin, allowedOrigins },
        "[cors] Cross-origin request rejected — origin not in ALLOWED_ORIGINS",
      );

      return cb(
        new Error(`Origin "${origin}" is not permitted by CORS policy.`),
        false,
      );
    },
    credentials: true,
  });

  app.get("/probe", async () => ({ ok: true }));
  await app.ready();
  return app;
}

const PROD_ORIGINS = ["https://app.clubos.com.br", "https://clubos.com.br"];

describe("CORS — production allow-list", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildCorsTestApp(PROD_ORIGINS, "production");
  });

  afterEach(async () => {
    await app.close();
  });

  it("allows the first listed https:// origin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "https://app.clubos.com.br" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.clubos.com.br",
    );
  });

  it("allows the second listed https:// origin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "https://clubos.com.br" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://clubos.com.br",
    );
  });

  it("sets Access-Control-Allow-Credentials: true for a listed origin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "https://app.clubos.com.br" },
    });

    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("rejects an unlisted origin — no Access-Control-Allow-Origin header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "https://evil.example.com" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects an http:// version of a listed origin (scheme mismatch)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "http://app.clubos.com.br" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects a subdomain not in the allow-list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "https://staging.clubos.com.br" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests with no Origin header (same-origin / non-browser clients)", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });

    expect(res.statusCode).toBe(200);
  });

  it("handles preflight OPTIONS for a listed origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/probe",
      headers: {
        origin: "https://app.clubos.com.br",
        "access-control-request-method": "POST",
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://app.clubos.com.br",
    );
  });

  it("rejects preflight for an unlisted origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/probe",
      headers: {
        origin: "https://attacker.example.com",
        "access-control-request-method": "POST",
      },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("CORS — development: all origins reflected", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildCorsTestApp([], "development");
  });

  afterEach(async () => {
    await app.close();
  });

  it("reflects http://localhost:3000 (standard Next.js dev server)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "http://localhost:3000" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });

  it("reflects an arbitrary http:// origin in development", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "http://some-dev-tool.local:8080" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://some-dev-tool.local:8080",
    );
  });

  it("reflects an https:// origin in development too", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "https://staging.clubos.com.br" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://staging.clubos.com.br",
    );
  });

  it("still includes Access-Control-Allow-Credentials: true in development", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "http://localhost:3000" },
    });

    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("allows requests with no Origin header in development", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.statusCode).toBe(200);
  });
});

describe("CORS — test environment: all origins reflected", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildCorsTestApp([], "test");
  });

  afterEach(async () => {
    await app.close();
  });

  it("reflects any origin in the test environment", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/probe",
      headers: { origin: "http://localhost:3000" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
  });
});
