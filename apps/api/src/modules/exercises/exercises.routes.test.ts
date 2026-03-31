import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { exerciseRoutes } from "./exercises.routes.js";
import {
  ExerciseNotFoundError,
  ExerciseInUseError,
} from "./exercises.service.js";
import type { ExerciseResponse } from "./exercises.schema.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./exercises.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./exercises.service.js")>();
  return {
    ExerciseNotFoundError: original.ExerciseNotFoundError,
    ExerciseInUseError: original.ExerciseInUseError,
    createExercise: vi.fn(),
    getExerciseById: vi.fn(),
    updateExercise: vi.fn(),
    deleteExercise: vi.fn(),
    listExercises: vi.fn(),
  };
});

import {
  createExercise,
  getExerciseById,
  updateExercise,
  deleteExercise,
  listExercises,
} from "./exercises.service.js";

const EXERCISE: ExerciseResponse = {
  id: "exercise_001",
  name: "Supino Reto",
  description: "Peito completo",
  category: "STRENGTH",
  muscleGroups: ["peitoral", "tríceps"],
  isActive: true,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
};

const ADMIN_USER: AccessTokenPayload = {
  sub: "user_admin",
  clubId: "club_xyz",
  role: "ADMIN",
  type: "access",
};

const TREASURER_USER: AccessTokenPayload = {
  sub: "user_treasurer",
  clubId: "club_xyz",
  role: "TREASURER",
  type: "access",
};

async function buildApp(
  userPayload: AccessTokenPayload = ADMIN_USER,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

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

  await app.register(exerciseRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET / (list exercises)", () => {
  it("returns 200 with paginated data from the service", async () => {
    const page = { data: [EXERCISE], total: 1, page: 1, limit: 20 };
    vi.mocked(listExercises).mockResolvedValue(page);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 1, data: [{ id: EXERCISE.id }] });
  });

  it("passes parsed query params to the service", async () => {
    vi.mocked(listExercises).mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      limit: 10,
    });

    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/?page=2&limit=10&category=CARDIO",
    });

    expect(listExercises).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({ page: 2, limit: 10, category: "CARDIO" }),
    );
  });

  it("returns 400 for invalid limit", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/?limit=999" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
    expect(listExercises).not.toHaveBeenCalled();
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(listExercises).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST / (create exercise)", () => {
  const validBody = { name: "Supino Reto", category: "STRENGTH" };

  it("returns 201 with the created exercise (ADMIN)", async () => {
    vi.mocked(createExercise).mockResolvedValue(EXERCISE);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: EXERCISE.id, name: EXERCISE.name });
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(403);
    expect(createExercise).not.toHaveBeenCalled();
  });

  it("returns 400 for missing name", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { category: "CARDIO" },
    });

    expect(res.statusCode).toBe(400);
    expect(createExercise).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid category", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { name: "Test", category: "YOGA" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("passes clubId and actorId from the JWT to the service", async () => {
    vi.mocked(createExercise).mockResolvedValue(EXERCISE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "POST", url: "/", payload: validBody });

    expect(createExercise).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      expect.objectContaining({ name: "Supino Reto" }),
    );
  });

  it("re-throws unexpected service errors (results in 500)", async () => {
    vi.mocked(createExercise).mockRejectedValue(new Error("DB failure"));

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /:exerciseId (get by id)", () => {
  it("returns 200 with the exercise data", async () => {
    vi.mocked(getExerciseById).mockResolvedValue(EXERCISE);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/exercise_001" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: EXERCISE.id });
  });

  it("returns 404 when service throws ExerciseNotFoundError", async () => {
    vi.mocked(getExerciseById).mockRejectedValue(new ExerciseNotFoundError());

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nonexistent" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Exercício não encontrado",
    });
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(getExerciseById).mockResolvedValue(EXERCISE);
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/exercise_001" });
    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /:exerciseId (update)", () => {
  it("returns 200 with updated exercise (ADMIN)", async () => {
    const updated = { ...EXERCISE, name: "Supino Inclinado" };
    vi.mocked(updateExercise).mockResolvedValue(updated);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/exercise_001",
      payload: { name: "Supino Inclinado" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "Supino Inclinado" });
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/exercise_001",
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(403);
    expect(updateExercise).not.toHaveBeenCalled();
  });

  it("returns 404 when service throws ExerciseNotFoundError", async () => {
    vi.mocked(updateExercise).mockRejectedValue(new ExerciseNotFoundError());

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/nonexistent",
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for invalid category in body", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/exercise_001",
      payload: { category: "YOGA" },
    });
    expect(res.statusCode).toBe(400);
    expect(updateExercise).not.toHaveBeenCalled();
  });
});

describe("DELETE /:exerciseId (soft delete)", () => {
  it("returns 204 on successful soft-delete (ADMIN)", async () => {
    vi.mocked(deleteExercise).mockResolvedValue(undefined);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/exercise_001" });

    expect(res.statusCode).toBe(204);
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "DELETE", url: "/exercise_001" });
    expect(res.statusCode).toBe(403);
    expect(deleteExercise).not.toHaveBeenCalled();
  });

  it("returns 404 when service throws ExerciseNotFoundError", async () => {
    vi.mocked(deleteExercise).mockRejectedValue(new ExerciseNotFoundError());

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when service throws ExerciseInUseError", async () => {
    vi.mocked(deleteExercise).mockRejectedValue(new ExerciseInUseError());

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/exercise_001" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      statusCode: 409,
      error: "Conflict",
      message: "Exercício está vinculado a sessões existentes",
    });
  });
});
