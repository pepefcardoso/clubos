import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import securityHeadersPlugin from "../plugins/security-headers.plugin.js";

async function buildApp(nodeEnv?: string): Promise<FastifyInstance> {
  const savedEnv = process.env["NODE_ENV"];
  if (nodeEnv !== undefined) process.env["NODE_ENV"] = nodeEnv;

  const fastify = Fastify({ logger: false });
  await fastify.register(securityHeadersPlugin);

  fastify.get("/probe", async () => ({ ok: true }));

  await fastify.ready();

  if (nodeEnv !== undefined) process.env["NODE_ENV"] = savedEnv;
  return fastify;
}

describe("securityHeadersPlugin — static headers (all environments)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp("test");
  });

  afterEach(async () => {
    await app.close();
  });

  it("sets X-Content-Type-Options: nosniff", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets Referrer-Policy: strict-origin-when-cross-origin", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("does NOT set Strict-Transport-Security in non-production", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("headers are present on every response, not just the first", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ method: "GET", url: "/probe" });
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
    }
  });

  it("headers are added to 4xx responses too", async () => {
    const res = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });
});

describe("securityHeadersPlugin — HSTS (production only)", () => {
  let app: FastifyInstance;
  let savedEnv: string | undefined;

  beforeEach(async () => {
    savedEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";

    app = Fastify({ logger: false });
    await app.register(securityHeadersPlugin);
    app.get("/probe", async () => ({ ok: true }));
    await app.ready();
  });

  afterEach(async () => {
    process.env["NODE_ENV"] = savedEnv;
    await app.close();
  });

  it("sets Strict-Transport-Security with a 2-year max-age in production", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    const hsts = res.headers["strict-transport-security"] as string;
    expect(hsts).toBeDefined();
    expect(hsts).toMatch(/max-age=63072000/);
  });

  it("HSTS header includes includeSubDomains", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.headers["strict-transport-security"]).toMatch(
      /includeSubDomains/,
    );
  });

  it("HSTS header includes preload", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.headers["strict-transport-security"]).toMatch(/preload/);
  });

  it("static security headers are still present in production", async () => {
    const res = await app.inject({ method: "GET", url: "/probe" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });
});
