import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { evaluationRoutes } from "./evaluations.routes.js";
import {
  EvaluationNotFoundError,
  DuplicateEvaluationError,
} from "./evaluations.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./evaluations.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./evaluations.service.js")>();
  return {
    EvaluationNotFoundError: original.EvaluationNotFoundError,
    DuplicateEvaluationError: original.DuplicateEvaluationError,
    createEvaluation: vi.fn(),
    getEvaluationById: vi.fn(),
    updateEvaluation: vi.fn(),
    deleteEvaluation: vi.fn(),
    listEvaluations: vi.fn(),
  };
});

import {
  createEvaluation,
  getEvaluationById,
  updateEvaluation,
  deleteEvaluation,
  listEvaluations,
} from "./evaluations.service.js";

const ADMIN_USER: AccessTokenPayload = {
  sub: "user_admin_001",
  clubId: "testclubid0000000001",
  role: "ADMIN",
  type: "access",
};

const TREASURER_USER: AccessTokenPayload = {
  sub: "user_treasurer_001",
  clubId: "testclubid0000000001",
  role: "TREASURER",
  type: "access",
};

const EVAL_RESPONSE = {
  id: "eval_001",
  athleteId: "athlete_001",
  athleteName: "Carlos Eduardo",
  microcycle: "2025-W03",
  date: "2025-01-13",
  technique: 4,
  tactical: 3,
  physical: 5,
  mental: 4,
  attitude: 5,
  averageScore: 4.2,
  notes: null,
  actorId: "user_admin_001",
  createdAt: "2025-01-13T10:00:00.000Z",
  updatedAt: "2025-01-13T10:00:00.000Z",
};

const VALID_CREATE_BODY = {
  athleteId: "athlete_001",
  microcycle: "2025-W03",
  date: "2025-01-13",
  technique: 4,
  tactical: 3,
  physical: 5,
  mental: 4,
  attitude: 5,
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

  app.addHook("onRequest", async (request) => {
    await (
      app as unknown as {
        verifyAccessToken: (r: FastifyRequest) => Promise<void>;
      }
    ).verifyAccessToken(request);
  });

  app.decorate(
    "requireRole",
    (...allowedRoles: Array<"ADMIN" | "TREASURER" | "PHYSIO">) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const role: string =
          (request as FastifyRequest & { user?: AccessTokenPayload }).user
            ?.role ?? "";

        const allowed =
          role === "ADMIN" ||
          allowedRoles.includes(role as "ADMIN" | "TREASURER" | "PHYSIO");

        if (!allowed) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Insufficient role",
          });
        }
      };
    },
  );

  await app.register(evaluationRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /evaluations (list)", () => {
  it("returns 200 with paginated data", async () => {
    const page = { data: [EVAL_RESPONSE], total: 1, page: 1, limit: 20 };
    vi.mocked(listEvaluations).mockResolvedValue(page);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 1, data: [{ id: "eval_001" }] });
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(listEvaluations).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
  });

  it("passes athleteId query param to the service", async () => {
    vi.mocked(listEvaluations).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/?athleteId=athlete_001" });
    expect(listEvaluations).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({ athleteId: "athlete_001" }),
    );
  });

  it("returns 400 for invalid limit (> 100)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/?limit=999" });
    expect(res.statusCode).toBe(400);
    expect(listEvaluations).not.toHaveBeenCalled();
  });
});

describe("POST /evaluations (create)", () => {
  it("returns 201 with created evaluation (ADMIN)", async () => {
    vi.mocked(createEvaluation).mockResolvedValue(EVAL_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "eval_001", averageScore: 4.2 });
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(createEvaluation).not.toHaveBeenCalled();
  });

  it("returns 409 on duplicate (athleteId, microcycle)", async () => {
    vi.mocked(createEvaluation).mockRejectedValue(
      new DuplicateEvaluationError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ statusCode: 409, error: "Conflict" });
  });

  it("returns 400 for missing required field (athleteId)", async () => {
    const app = await buildApp(ADMIN_USER);
    const { athleteId: _, ...withoutAthleteId } = VALID_CREATE_BODY;
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: withoutAthleteId,
    });
    expect(res.statusCode).toBe(400);
    expect(createEvaluation).not.toHaveBeenCalled();
  });

  it("returns 400 for score out of range (technique=6)", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, technique: 6 },
    });
    expect(res.statusCode).toBe(400);
    expect(createEvaluation).not.toHaveBeenCalled();
  });

  it("returns 400 for score out of range (mental=0)", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, mental: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid microcycle format", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, microcycle: "week-3" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, date: "13/01/2025" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("re-throws unexpected errors (results in 500)", async () => {
    vi.mocked(createEvaluation).mockRejectedValue(
      new Error("DB connection lost"),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(500);
  });

  it("passes clubId and actorId from JWT to the service", async () => {
    vi.mocked(createEvaluation).mockResolvedValue(EVAL_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "POST", url: "/", payload: VALID_CREATE_BODY });
    expect(createEvaluation).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      expect.objectContaining({ athleteId: "athlete_001" }),
    );
  });
});

describe("GET /evaluations/:evaluationId (get by id)", () => {
  it("returns 200 with evaluation data", async () => {
    vi.mocked(getEvaluationById).mockResolvedValue(EVAL_RESPONSE);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/eval_001" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: "eval_001" });
  });

  it("returns 404 when service throws EvaluationNotFoundError", async () => {
    vi.mocked(getEvaluationById).mockRejectedValue(
      new EvaluationNotFoundError(),
    );
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("is accessible by TREASURER", async () => {
    vi.mocked(getEvaluationById).mockResolvedValue(EVAL_RESPONSE);
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/eval_001" });
    expect(res.statusCode).toBe(200);
  });
});

describe("PUT /evaluations/:evaluationId (update)", () => {
  it("returns 200 with updated evaluation (ADMIN)", async () => {
    vi.mocked(updateEvaluation).mockResolvedValue({
      ...EVAL_RESPONSE,
      technique: 5,
    });
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/eval_001",
      payload: { technique: 5 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ technique: 5 });
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/eval_001",
      payload: { technique: 5 },
    });
    expect(res.statusCode).toBe(403);
    expect(updateEvaluation).not.toHaveBeenCalled();
  });

  it("returns 404 when evaluation does not exist", async () => {
    vi.mocked(updateEvaluation).mockRejectedValue(
      new EvaluationNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/nonexistent",
      payload: { technique: 3 },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for score out of range in update", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/eval_001",
      payload: { attitude: 10 },
    });
    expect(res.statusCode).toBe(400);
    expect(updateEvaluation).not.toHaveBeenCalled();
  });

  it("accepts partial update (only notes)", async () => {
    vi.mocked(updateEvaluation).mockResolvedValue({
      ...EVAL_RESPONSE,
      notes: "Updated",
    });
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/eval_001",
      payload: { notes: "Updated" },
    });
    expect(res.statusCode).toBe(200);
    expect(updateEvaluation).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      "eval_001",
      expect.objectContaining({ notes: "Updated" }),
    );
  });
});

describe("DELETE /evaluations/:evaluationId (delete)", () => {
  it("returns 204 on successful delete (ADMIN)", async () => {
    vi.mocked(deleteEvaluation).mockResolvedValue(undefined);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/eval_001" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "DELETE", url: "/eval_001" });
    expect(res.statusCode).toBe(403);
    expect(deleteEvaluation).not.toHaveBeenCalled();
  });

  it("returns 404 when evaluation does not exist", async () => {
    vi.mocked(deleteEvaluation).mockRejectedValue(
      new EvaluationNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("passes clubId and actorId to service", async () => {
    vi.mocked(deleteEvaluation).mockResolvedValue(undefined);
    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "DELETE", url: "/eval_001" });
    expect(deleteEvaluation).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      "eval_001",
    );
  });
});
