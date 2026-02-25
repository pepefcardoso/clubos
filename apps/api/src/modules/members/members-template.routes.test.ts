import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../server.js";

describe("GET /api/members/import/template", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with CSV content-type and attachment disposition", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/import/template",
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-type"]).toMatch(/charset=utf-8/);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain("template-socios.csv");
  });

  it("CSV body contains all expected header columns", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/import/template",
    });

    const firstLine = res.body.split("\n")[0] ?? "";

    expect(firstLine).toContain("nome");
    expect(firstLine).toContain("cpf");
    expect(firstLine).toContain("telefone");

    expect(firstLine).toContain("email");
    expect(firstLine).toContain("plano_id");
    expect(firstLine).toContain("data_entrada");
  });

  it("CSV body contains at least three data rows after the header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/import/template",
    });

    const lines = res.body
      .split("\n")
      .filter((line: string) => line.trim() !== "");

    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it("illustrates both accepted date formats (YYYY-MM-DD and DD/MM/YYYY)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/import/template",
    });

    const body = res.body;
    expect(body).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(body).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("does not require an Authorization header (public endpoint)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/import/template",
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns a non-empty body", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/import/template",
    });

    expect(res.body.trim().length).toBeGreaterThan(0);
  });
});
