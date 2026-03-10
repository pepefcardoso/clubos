import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { athleteRoutes } from "./athletes.routes.js";
import {
  DuplicateAthleteCpfError,
  AthleteNotFoundError,
} from "./athletes.service.js";
import type { AthleteResponse } from "./athletes.schema.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./athletes.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./athletes.service.js")>();
  return {
    DuplicateAthleteCpfError: original.DuplicateAthleteCpfError,
    AthleteNotFoundError: original.AthleteNotFoundError,
    createAthlete: vi.fn(),
    getAthleteById: vi.fn(),
    updateAthlete: vi.fn(),
    listAthletes: vi.fn(),
  };
});

import {
  createAthlete,
  getAthleteById,
  updateAthlete,
  listAthletes,
} from "./athletes.service.js";

const ATHLETE: AthleteResponse = {
  id: "athlete_abc123",
  name: "João Silva",
  cpf: "12345678901",
  birthDate: new Date("1990-05-15"),
  position: "Goleiro",
  status: "ACTIVE",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

const ADMIN_USER = {
  sub: "user_admin",
  clubId: "club_xyz",
  role: "ADMIN" as const,
  type: "access" as const,
};

const TREASURER_USER = {
  sub: "user_treasurer",
  clubId: "club_xyz",
  role: "TREASURER" as const,
  type: "access" as const,
};

/**
 * Builds a minimal Fastify instance with:
 *   - a stub prisma decorator
 *   - stub verifyAccessToken that injects `user` based on the role param
 *   - stub requireRole that enforces ADMIN-only on PUT routes
 *   - athlete routes registered at "/"
 */
async function buildApp(
  userPayload: AccessTokenPayload = ADMIN_USER,
): Promise<FastifyInstance> {
  const app = Fastify();

  app.decorate("prisma", {} as PrismaClient);

  app.decorate("verifyAccessToken", async (request: FastifyRequest) => {
    (request as FastifyRequest & { user: AccessTokenPayload }).user =
      userPayload;
    (request as FastifyRequest & { actorId: string }).actorId = userPayload.sub;
  });

  app.decorate("requireRole", (minimumRole: "ADMIN" | "TREASURER") => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const role: string =
        (request as FastifyRequest & { user?: AccessTokenPayload }).user
          ?.role ?? "";
      const allowed =
        role === "ADMIN" ||
        (minimumRole === "TREASURER" && role === "TREASURER");
      if (!allowed) {
        return reply.status(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "Insufficient role",
        });
      }
    };
  });

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const r = request as FastifyRequest & {
      user?: AccessTokenPayload;
      actorId?: string;
    };
    if (r.user) r.actorId = r.user.sub;
  });

  await app.register(athleteRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /athletes (list)", () => {
  it("returns 200 with paginated data from the service", async () => {
    const page = { data: [ATHLETE], total: 1, page: 1, limit: 20 };
    vi.mocked(listAthletes).mockResolvedValue(page);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 1, data: [{ id: ATHLETE.id }] });
  });

  it("passes parsed query params to the service", async () => {
    vi.mocked(listAthletes).mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      limit: 10,
    });

    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/?page=2&limit=10&status=INACTIVE&search=maria",
    });

    expect(listAthletes).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({
        page: 2,
        limit: 10,
        status: "INACTIVE",
        search: "maria",
      }),
    );
  });

  it("returns 400 for invalid query params", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/?limit=999",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
    expect(listAthletes).not.toHaveBeenCalled();
  });
});

describe("POST /athletes (create)", () => {
  const validBody = {
    name: "João Silva",
    cpf: "12345678901",
    birthDate: "1990-05-15",
    position: "Goleiro",
  };

  it("returns 201 with the created athlete", async () => {
    vi.mocked(createAthlete).mockResolvedValue(ATHLETE);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: ATHLETE.id, name: ATHLETE.name });
  });

  it("passes clubId and actorId from the JWT to the service", async () => {
    vi.mocked(createAthlete).mockResolvedValue(ATHLETE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "POST", url: "/", payload: validBody });

    expect(createAthlete).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      expect.objectContaining({ cpf: "12345678901" }),
    );
  });

  it("returns 409 when the service throws DuplicateAthleteCpfError", async () => {
    vi.mocked(createAthlete).mockRejectedValue(new DuplicateAthleteCpfError());

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      statusCode: 409,
      error: "Conflict",
      message: "Atleta com este CPF já está cadastrado",
    });
  });

  it("returns 400 for a payload missing required fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { name: "Sem CPF" },
    });

    expect(res.statusCode).toBe(400);
    expect(createAthlete).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid CPF format (masked)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...validBody, cpf: "123.456.789-01" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("re-throws unexpected service errors (results in 500)", async () => {
    vi.mocked(createAthlete).mockRejectedValue(new Error("DB connection lost"));

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(500);
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(createAthlete).mockResolvedValue(ATHLETE);

    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
  });
});

describe("GET /athletes/:athleteId (get by id)", () => {
  it("returns 200 with the athlete data", async () => {
    vi.mocked(getAthleteById).mockResolvedValue(ATHLETE);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athlete_abc123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: ATHLETE.id });
  });

  it("passes clubId from the JWT to the service", async () => {
    vi.mocked(getAthleteById).mockResolvedValue(ATHLETE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "GET", url: "/athlete_abc123" });

    expect(getAthleteById).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      "athlete_abc123",
    );
  });

  it("returns 404 when the service throws AthleteNotFoundError", async () => {
    vi.mocked(getAthleteById).mockRejectedValue(new AthleteNotFoundError());

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nonexistent" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(getAthleteById).mockResolvedValue(ATHLETE);

    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/athlete_abc123" });

    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /athletes/:athleteId (update)", () => {
  const validUpdate = { name: "João Atualizado", status: "INACTIVE" };

  it("returns 200 with the updated athlete (ADMIN)", async () => {
    const updated = { ...ATHLETE, name: "João Atualizado", status: "INACTIVE" };
    vi.mocked(updateAthlete).mockResolvedValue(updated);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/athlete_abc123",
      payload: validUpdate,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "João Atualizado" });
  });

  it("returns 403 when called by a TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/athlete_abc123",
      payload: validUpdate,
    });

    expect(res.statusCode).toBe(403);
    expect(updateAthlete).not.toHaveBeenCalled();
  });

  it("returns 404 when the service throws AthleteNotFoundError", async () => {
    vi.mocked(updateAthlete).mockRejectedValue(new AthleteNotFoundError());

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/nonexistent",
      payload: validUpdate,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("returns 400 for an invalid status value", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/athlete_abc123",
      payload: { status: "OVERDUE" },
    });

    expect(res.statusCode).toBe(400);
    expect(updateAthlete).not.toHaveBeenCalled();
  });

  it("does not accept cpf in the update body", async () => {
    vi.mocked(updateAthlete).mockResolvedValue(ATHLETE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/athlete_abc123",
      payload: { name: "X", cpf: "99999999999" },
    });

    const calledWith = vi.mocked(updateAthlete).mock.calls[0]?.[4];
    expect(calledWith).not.toHaveProperty("cpf");
  });

  it("passes clubId and actorId from the JWT to the service", async () => {
    vi.mocked(updateAthlete).mockResolvedValue(ATHLETE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/athlete_abc123",
      payload: { name: "X" },
    });

    expect(updateAthlete).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      "athlete_abc123",
      expect.objectContaining({ name: "X" }),
    );
  });
});
