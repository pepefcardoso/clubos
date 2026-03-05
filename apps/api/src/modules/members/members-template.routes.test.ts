import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  }),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn().mockResolvedValue(null),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../jobs/index.js", () => ({
  registerJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/prisma.js", () => ({
  getPrismaClient: vi.fn().mockReturnValue({}),
  withTenantSchema: vi.fn(),
  isPrismaUniqueConstraintError: vi.fn(),
}));

import { buildApp } from "../../server.js";

describe("GET /api/members/import/template", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["ASAAS_API_KEY"] = "ci-fake-asaas-key";
    process.env["ASAAS_WEBHOOK_SECRET"] = "ci-fake-webhook-secret";
    process.env["JWT_SECRET"] = "ci-test-jwt-secret-at-least-32chars!!";
    process.env["JWT_REFRESH_SECRET"] = "ci-test-refresh-secret-at-least-32ch!";
    process.env["MEMBER_ENCRYPTION_KEY"] = "ci-test-encryption-key-32chars-xxx";
    process.env["REDIS_URL"] = "redis://localhost:6379";

    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
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

    expect(res.body).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(res.body).toMatch(/\d{2}\/\d{2}\/\d{4}/);
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
