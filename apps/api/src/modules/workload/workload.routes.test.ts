import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { workloadRoutes } from "./workload.routes.js";
import { AthleteNotFoundError } from "./workload.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import type { RiskZone } from "./workload.schema.js";

vi.mock("./workload.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./workload.service.js")>();
  return {
    AthleteNotFoundError: original.AthleteNotFoundError,
    recordWorkloadMetric: vi.fn(),
    getAthleteAcwr: vi.fn(),
  };
});

import { recordWorkloadMetric, getAthleteAcwr } from "./workload.service.js";

const ADMIN_USER: AccessTokenPayload = {
  sub: "user_admin_001",
  clubId: "testclubid0000000001",
  role: "ADMIN",
  type: "access",
};

const WORKLOAD_METRIC_RESPONSE = {
  id: "metric_001",
  athleteId: "athlete_001",
  date: new Date("2024-06-01"),
  rpe: 7,
  durationMinutes: 60,
  trainingLoadAu: 420,
  sessionType: "TRAINING",
  notes: null,
  createdAt: new Date("2024-06-01T10:00:00Z"),
};

const ACWR_RESPONSE = {
  athleteId: "athlete_001",
  latest: {
    date: new Date("2024-06-01"),
    dailyAu: 420,
    acuteLoadAu: 2100,
    chronicLoadAu: 1800,
    acuteWindowDays: 5,
    chronicWindowDays: 20,
    acwrRatio: 1.17,
    riskZone: "optimal" as RiskZone,
  },
  history: [
    {
      date: new Date("2024-06-01"),
      dailyAu: 420,
      acuteLoadAu: 2100,
      chronicLoadAu: 1800,
      acuteWindowDays: 5,
      chronicWindowDays: 20,
      acwrRatio: 1.17,
      riskZone: "optimal" as RiskZone,
    },
  ],
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars --- IGNORE ---
  app.decorate("requireRole", (_minimumRole: "ADMIN" | "TREASURER") => {
    return async () => {
      // Not called in workload routes (both are accessible by all roles)
    };
  });

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const r = request as FastifyRequest & {
      user?: AccessTokenPayload;
      actorId?: string;
    };
    if (r.user) r.actorId = r.user.sub;
  });

  await app.register(workloadRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /workload/metrics", () => {
  const validBody = {
    athleteId: "athlete_001",
    date: "2024-06-01",
    rpe: 7,
    durationMinutes: 60,
  };

  it("returns 201 with the workload metric on a valid payload", async () => {
    vi.mocked(recordWorkloadMetric).mockResolvedValue(WORKLOAD_METRIC_RESPONSE);

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "metric_001", trainingLoadAu: 420 });
  });

  it("returns 404 when the service throws AthleteNotFoundError", async () => {
    vi.mocked(recordWorkloadMetric).mockRejectedValue(
      new AthleteNotFoundError(),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: validBody,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });
  });

  it("returns 400 for rpe = 0 (below minimum)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: { ...validBody, rpe: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
    expect(recordWorkloadMetric).not.toHaveBeenCalled();
  });

  it("returns 400 for rpe = 11 (above maximum)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: { ...validBody, rpe: 11 },
    });

    expect(res.statusCode).toBe(400);
    expect(recordWorkloadMetric).not.toHaveBeenCalled();
  });

  it("returns 400 for durationMinutes = 0", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: { ...validBody, durationMinutes: 0 },
    });

    expect(res.statusCode).toBe(400);
    expect(recordWorkloadMetric).not.toHaveBeenCalled();
  });

  it("returns 400 for durationMinutes > 480", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: { ...validBody, durationMinutes: 481 },
    });

    expect(res.statusCode).toBe(400);
    expect(recordWorkloadMetric).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid date format", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: { ...validBody, date: "01/06/2024" },
    });

    expect(res.statusCode).toBe(400);
    expect(recordWorkloadMetric).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing required field (athleteId)", async () => {
    const app = await buildApp();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { athleteId: _athleteId, ...withoutAthleteId } = validBody;
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: withoutAthleteId,
    });

    expect(res.statusCode).toBe(400);
    expect(recordWorkloadMetric).not.toHaveBeenCalled();
  });

  it("passes clubId and actorId from the JWT to the service", async () => {
    vi.mocked(recordWorkloadMetric).mockResolvedValue(WORKLOAD_METRIC_RESPONSE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "POST",
      url: "/metrics",
      payload: validBody,
    });

    expect(recordWorkloadMetric).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      expect.objectContaining({ athleteId: "athlete_001" }),
    );
  });

  it("accepts an optional sessionType of MATCH", async () => {
    vi.mocked(recordWorkloadMetric).mockResolvedValue({
      ...WORKLOAD_METRIC_RESPONSE,
      sessionType: "MATCH",
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: { ...validBody, sessionType: "MATCH" },
    });

    expect(res.statusCode).toBe(201);
    expect(recordWorkloadMetric).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ sessionType: "MATCH" }),
    );
  });

  it("re-throws unexpected service errors (results in 500)", async () => {
    vi.mocked(recordWorkloadMetric).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/metrics",
      payload: validBody,
    });

    expect(res.statusCode).toBe(500);
  });
});

describe("GET /workload/athletes/:athleteId/acwr", () => {
  it("returns 200 with athleteId, latest, and history", async () => {
    vi.mocked(getAthleteAcwr).mockResolvedValue(ACWR_RESPONSE);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      athleteId: "athlete_001",
      history: expect.any(Array),
    });
  });

  it("returns 404 when the service throws AthleteNotFoundError", async () => {
    vi.mocked(getAthleteAcwr).mockRejectedValue(new AthleteNotFoundError());

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athletes/nonexistent/acwr",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });
  });

  it("returns 400 for days < 7", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr?days=6",
    });

    expect(res.statusCode).toBe(400);
    expect(getAthleteAcwr).not.toHaveBeenCalled();
  });

  it("returns 400 for days > 90", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr?days=91",
    });

    expect(res.statusCode).toBe(400);
    expect(getAthleteAcwr).not.toHaveBeenCalled();
  });

  it("passes parsed days param to the service", async () => {
    vi.mocked(getAthleteAcwr).mockResolvedValue(ACWR_RESPONSE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr?days=60",
    });

    expect(getAthleteAcwr).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      "athlete_001",
      60,
    );
  });

  it("uses the default of 28 days when days param is omitted", async () => {
    vi.mocked(getAthleteAcwr).mockResolvedValue(ACWR_RESPONSE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr",
    });

    expect(getAthleteAcwr).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      "athlete_001",
      28,
    );
  });

  it("returns empty history without erroring when view has no data", async () => {
    vi.mocked(getAthleteAcwr).mockResolvedValue({
      athleteId: "athlete_001",
      latest: null,
      history: [],
    });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ latest: null, history: [] });
  });

  it("passes clubId from JWT to the service", async () => {
    vi.mocked(getAthleteAcwr).mockResolvedValue(ACWR_RESPONSE);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr",
    });

    expect(getAthleteAcwr).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.any(String),
      expect.any(Number),
    );
  });

  it("re-throws unexpected service errors (results in 500)", async () => {
    vi.mocked(getAthleteAcwr).mockRejectedValue(new Error("View not found"));

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athletes/athlete_001/acwr",
    });

    expect(res.statusCode).toBe(500);
  });
});
