import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { trainingSessionRoutes } from "./training-sessions.routes.js";
import {
  TrainingSessionNotFoundError,
  TrainingSessionCompletedError,
  ExerciseNotFoundError,
  SessionExerciseNotFoundError,
} from "./training-sessions.service.js";
import type { TrainingSessionResponse } from "./training-sessions.schema.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./training-sessions.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./training-sessions.service.js")>();
  return {
    TrainingSessionNotFoundError: original.TrainingSessionNotFoundError,
    TrainingSessionCompletedError: original.TrainingSessionCompletedError,
    ExerciseNotFoundError: original.ExerciseNotFoundError,
    SessionExerciseNotFoundError: original.SessionExerciseNotFoundError,
    createTrainingSession: vi.fn(),
    getTrainingSessionById: vi.fn(),
    updateTrainingSession: vi.fn(),
    deleteTrainingSession: vi.fn(),
    listTrainingSessions: vi.fn(),
    addExerciseToSession: vi.fn(),
    removeExerciseFromSession: vi.fn(),
  };
});

import {
  createTrainingSession,
  getTrainingSessionById,
  updateTrainingSession,
  deleteTrainingSession,
  listTrainingSessions,
  addExerciseToSession,
  removeExerciseFromSession,
} from "./training-sessions.service.js";

const SESSION: TrainingSessionResponse = {
  id: "session_001",
  title: "Treino de Força",
  scheduledAt: "2025-06-01T09:00:00.000Z",
  sessionType: "TRAINING",
  durationMinutes: 90,
  notes: null,
  isCompleted: false,
  exercises: [],
  createdAt: "2025-05-01T00:00:00.000Z",
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

  app.decorate("requireRole", (minimumRole: "ADMIN" | "TREASURER" | "PHYSIO") => {
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

  await app.register(trainingSessionRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET / (list training sessions)", () => {
  it("returns 200 with paginated data", async () => {
    const page = { data: [SESSION], total: 1, page: 1, limit: 20 };
    vi.mocked(listTrainingSessions).mockResolvedValue(page);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 1, data: [{ id: SESSION.id }] });
  });

  it("returns 400 for invalid limit", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/?limit=999" });
    expect(res.statusCode).toBe(400);
    expect(listTrainingSessions).not.toHaveBeenCalled();
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(listTrainingSessions).mockResolvedValue({
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

describe("POST / (create training session)", () => {
  const validBody = {
    title: "Treino de Força",
    scheduledAt: "2025-06-01T09:00:00.000Z",
    durationMinutes: 90,
  };

  it("returns 201 with created session (ADMIN)", async () => {
    vi.mocked(createTrainingSession).mockResolvedValue(SESSION);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: SESSION.id });
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });
    expect(res.statusCode).toBe(403);
    expect(createTrainingSession).not.toHaveBeenCalled();
  });

  it("returns 400 for missing title", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { scheduledAt: "2025-06-01T09:00:00.000Z", durationMinutes: 60 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid scheduledAt", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...validBody, scheduledAt: "not-a-date" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when service throws ExerciseNotFoundError", async () => {
    vi.mocked(createTrainingSession).mockRejectedValue(
      new ExerciseNotFoundError(),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /:sessionId (get by id)", () => {
  it("returns 200 with session data", async () => {
    vi.mocked(getTrainingSessionById).mockResolvedValue(SESSION);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/session_001" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: SESSION.id });
  });

  it("returns 404 when service throws TrainingSessionNotFoundError", async () => {
    vi.mocked(getTrainingSessionById).mockRejectedValue(
      new TrainingSessionNotFoundError(),
    );

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nonexistent" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Sessão de treino não encontrada",
    });
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(getTrainingSessionById).mockResolvedValue(SESSION);
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/session_001" });
    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /:sessionId (update)", () => {
  it("returns 200 with updated session (ADMIN)", async () => {
    const updated = { ...SESSION, title: "Updated" };
    vi.mocked(updateTrainingSession).mockResolvedValue(updated);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/session_001",
      payload: { title: "Updated" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: "Updated" });
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/session_001",
      payload: { title: "X" },
    });
    expect(res.statusCode).toBe(403);
    expect(updateTrainingSession).not.toHaveBeenCalled();
  });

  it("returns 404 when service throws TrainingSessionNotFoundError", async () => {
    vi.mocked(updateTrainingSession).mockRejectedValue(
      new TrainingSessionNotFoundError(),
    );

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/nonexistent",
      payload: { title: "X" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /:sessionId (delete)", () => {
  it("returns 204 on successful delete (ADMIN)", async () => {
    vi.mocked(deleteTrainingSession).mockResolvedValue(undefined);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/session_001" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "DELETE", url: "/session_001" });
    expect(res.statusCode).toBe(403);
    expect(deleteTrainingSession).not.toHaveBeenCalled();
  });

  it("returns 404 when session not found", async () => {
    vi.mocked(deleteTrainingSession).mockRejectedValue(
      new TrainingSessionNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when service throws TrainingSessionCompletedError", async () => {
    vi.mocked(deleteTrainingSession).mockRejectedValue(
      new TrainingSessionCompletedError(),
    );

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/session_001" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      statusCode: 409,
      error: "Conflict",
      message: "Sessões concluídas não podem ser excluídas",
    });
  });
});

describe("POST /:sessionId/exercises (add exercise)", () => {
  it("returns 200 with updated session (ADMIN)", async () => {
    vi.mocked(addExerciseToSession).mockResolvedValue(SESSION);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/session_001/exercises",
      payload: { exerciseId: "exercise_001", order: 0 },
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/session_001/exercises",
      payload: { exerciseId: "exercise_001", order: 0 },
    });
    expect(res.statusCode).toBe(403);
    expect(addExerciseToSession).not.toHaveBeenCalled();
  });

  it("returns 400 for missing exerciseId", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/session_001/exercises",
      payload: { order: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    vi.mocked(addExerciseToSession).mockRejectedValue(
      new TrainingSessionNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/nonexistent/exercises",
      payload: { exerciseId: "e1", order: 0 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when exercise not found", async () => {
    vi.mocked(addExerciseToSession).mockRejectedValue(
      new ExerciseNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/session_001/exercises",
      payload: { exerciseId: "ghost", order: 0 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ message: "Exercício não encontrado" });
  });
});

describe("DELETE /:sessionId/exercises/:exerciseId (remove exercise)", () => {
  it("returns 200 with updated session (ADMIN)", async () => {
    vi.mocked(removeExerciseFromSession).mockResolvedValue(SESSION);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/session_001/exercises/exercise_001",
    });

    expect(res.statusCode).toBe(200);
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/session_001/exercises/exercise_001",
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 404 when session exercise link not found", async () => {
    vi.mocked(removeExerciseFromSession).mockRejectedValue(
      new SessionExerciseNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/session_001/exercises/ghost",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      message: "Exercício não está nesta sessão",
    });
  });
});
