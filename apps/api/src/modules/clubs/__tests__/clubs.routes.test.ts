/**
 * Route-level tests for POST /api/clubs (T-002).
 *
 * Uses Fastify's inject() to exercise the full HTTP stack (routing, Zod
 * validation, error mapping) without hitting the database. The service layer
 * is fully mocked.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { clubRoutes } from "../clubs.routes.js";
import { DuplicateSlugError, DuplicateCnpjError } from "../clubs.service.js";

vi.mock("../clubs.service.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../clubs.service.js")>();
  return {
    ...original,
    createClub: vi.fn(),
  };
});

import { createClub } from "../clubs.service.js";

function makePrisma() {
  return {} as unknown as import("../../../../generated/prisma/index.js").PrismaClient;
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", makePrisma());
  app.decorate("redis", {} as never);
  await app.register(clubRoutes, { prefix: "/api/clubs" });
  return app;
}

const SUCCESS_BODY = {
  id: "clxyz1234567890abcdef",
  name: "Clube Atlético Exemplo",
  slug: "atletico-exemplo",
  cnpj: null,
  planTier: "starter",
  createdAt: new Date("2025-03-01T08:00:00.000Z").toISOString(),
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(createClub).mockReset();
});

describe("POST /api/clubs", () => {
  it("returns 201 with club body for valid name + slug", async () => {
    vi.mocked(createClub).mockResolvedValue({
      ...SUCCESS_BODY,
      createdAt: new Date(SUCCESS_BODY.createdAt),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "Clube Atlético Exemplo", slug: "atletico-exemplo" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBe("clxyz1234567890abcdef");
    expect(body.slug).toBe("atletico-exemplo");
    expect(body.planTier).toBe("starter");
  });

  it("returns 201 for valid name + slug + cnpj", async () => {
    vi.mocked(createClub).mockResolvedValue({
      ...SUCCESS_BODY,
      cnpj: "12345678000195",
      createdAt: new Date(SUCCESS_BODY.createdAt),
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: {
        name: "Clube Atlético Exemplo",
        slug: "atletico-exemplo",
        cnpj: "12345678000195",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().cnpj).toBe("12345678000195");
  });

  it("returns 409 with slug conflict message on DuplicateSlugError", async () => {
    vi.mocked(createClub).mockRejectedValue(new DuplicateSlugError());

    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "Clube Atlético Exemplo", slug: "atletico-exemplo" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toBe(
      "Um clube com este slug já está cadastrado",
    );
  });

  it("returns 409 with cnpj conflict message on DuplicateCnpjError", async () => {
    vi.mocked(createClub).mockRejectedValue(new DuplicateCnpjError());

    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: {
        name: "Clube Atlético Exemplo",
        slug: "atletico-exemplo",
        cnpj: "12345678000195",
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toBe(
      "Um clube com este CNPJ já está cadastrado",
    );
  });

  it("returns 400 for slug with uppercase letters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "My-Club" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for slug with spaces", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "my club" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for slug with special characters", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "my_club!" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for slug shorter than 3 chars", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "ab" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for slug longer than 50 chars", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "a".repeat(51) },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for CNPJ with mask (formatted)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "my-club", cnpj: "12.345.678/0001-95" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for CNPJ with 13 digits", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "my-club", cnpj: "1234567800019" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for CNPJ with 15 digits", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "my-club", cnpj: "123456780001950" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for name shorter than 2 chars", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "A", slug: "my-club" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for name longer than 120 chars", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "A".repeat(121), slug: "my-club" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { slug: "my-club" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when slug is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for empty body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("re-throws unexpected errors (results in 500)", async () => {
    vi.mocked(createClub).mockRejectedValue(new Error("DB connection lost"));

    const res = await app.inject({
      method: "POST",
      url: "/api/clubs",
      payload: { name: "My Club", slug: "my-club" },
    });

    expect(res.statusCode).toBe(500);
  });
});
