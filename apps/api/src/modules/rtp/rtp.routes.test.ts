import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { rtpRoutes } from "./rtp.routes.js";
import {
  AthleteNotFoundError,
  MedicalRecordNotFoundError,
  ProtocolNotFoundError,
} from "./rtp.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./rtp.service.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./rtp.service.js")>();
  return {
    AthleteNotFoundError: original.AthleteNotFoundError,
    MedicalRecordNotFoundError: original.MedicalRecordNotFoundError,
    ProtocolNotFoundError: original.ProtocolNotFoundError,
    getRtp: vi.fn(),
    upsertRtp: vi.fn(),
  };
});

import { getRtp, upsertRtp } from "./rtp.service.js";

const ADMIN_USER: AccessTokenPayload = {
  sub: "user_admin_001",
  clubId: "testclubid0000000001",
  role: "ADMIN",
  type: "access",
};

const PHYSIO_USER: AccessTokenPayload = {
  sub: "user_physio_001",
  clubId: "testclubid0000000001",
  role: "PHYSIO",
  type: "access",
};

const TREASURER_USER: AccessTokenPayload = {
  sub: "user_treasurer_001",
  clubId: "testclubid0000000001",
  role: "TREASURER",
  type: "access",
};

const ATHLETE_ID = "athlete_001";

const FULL_RTP_RESPONSE = {
  athleteId: ATHLETE_ID,
  status: "AFASTADO",
  medicalRecordId: null,
  protocolId: null,
  clearedAt: null,
  clearedBy: null,
  notes: "Dor no joelho",
  updatedAt: "2025-06-01T10:00:00.000Z",
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

  app.decorate(
    "requireRole",
    (...allowedRoles: Array<"ADMIN" | "TREASURER" | "PHYSIO">) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const role: string =
          (request as FastifyRequest & { user?: AccessTokenPayload }).user
            ?.role ?? "";

        let permitted: boolean;
        if (allowedRoles.length === 1) {
          const hierarchy: Record<string, number> = {
            PHYSIO: 0,
            TREASURER: 1,
            ADMIN: 2,
          };
          const userLevel = hierarchy[role] ?? -1;
          const requiredLevel = hierarchy[allowedRoles[0]!] ?? 99;
          permitted = userLevel >= requiredLevel;
        } else {
          permitted = (allowedRoles as string[]).includes(role);
        }

        if (!permitted) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Insufficient permissions.",
          });
        }
      };
    },
  );

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const r = request as FastifyRequest & {
      user?: AccessTokenPayload;
      actorId?: string;
    };
    if (r.user) r.actorId = r.user.sub;
  });

  await app.register(rtpRoutes, { prefix: "/athletes" });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /athletes/:athleteId/rtp", () => {
  it("returns 200 with full payload for ADMIN", async () => {
    vi.mocked(getRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/athletes/${ATHLETE_ID}/rtp`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      athleteId: ATHLETE_ID,
      status: "AFASTADO",
      medicalRecordId: null,
      protocolId: null,
      clearedAt: null,
      clearedBy: null,
      notes: "Dor no joelho",
      updatedAt: "2025-06-01T10:00:00.000Z",
    });
  });

  it("returns 200 with full payload for PHYSIO", async () => {
    vi.mocked(getRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "GET",
      url: `/athletes/${ATHLETE_ID}/rtp`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("notes");
    expect(res.json()).toHaveProperty("clearedAt");
  });

  it("returns 200 with restricted payload { athleteId, status } for TREASURER", async () => {
    vi.mocked(getRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: `/athletes/${ATHLETE_ID}/rtp`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ athleteId: ATHLETE_ID, status: "AFASTADO" });
    expect(body).not.toHaveProperty("notes");
    expect(body).not.toHaveProperty("clearedAt");
    expect(body).not.toHaveProperty("medicalRecordId");
  });

  it("returns { athleteId, status: null } when athlete has no RTP record", async () => {
    vi.mocked(getRtp).mockResolvedValue(null);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: `/athletes/${ATHLETE_ID}/rtp`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ athleteId: ATHLETE_ID, status: null });
  });

  it("returns { athleteId, status: null } for TREASURER when athlete has no RTP record", async () => {
    vi.mocked(getRtp).mockResolvedValue(null);
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: `/athletes/${ATHLETE_ID}/rtp`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ athleteId: ATHLETE_ID, status: null });
  });

  it("returns 404 when athlete does not exist", async () => {
    vi.mocked(getRtp).mockRejectedValue(new AthleteNotFoundError());
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/athletes/nonexistent/rtp",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });
  });

  it("passes clubId from JWT to the service", async () => {
    vi.mocked(getRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "GET",
      url: `/athletes/${ATHLETE_ID}/rtp`,
    });
    expect(getRtp).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ATHLETE_ID,
    );
  });

  it("re-throws unexpected errors (results in 500)", async () => {
    vi.mocked(getRtp).mockRejectedValue(new Error("DB connection lost"));
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/athletes/${ATHLETE_ID}/rtp`,
    });
    expect(res.statusCode).toBe(500);
  });
});

describe("PUT /athletes/:athleteId/rtp", () => {
  const VALID_BODY = { status: "RETORNO_PROGRESSIVO" };

  it("returns 200 with full RTP payload on success (ADMIN)", async () => {
    vi.mocked(upsertRtp).mockResolvedValue({
      ...FULL_RTP_RESPONSE,
      status: "RETORNO_PROGRESSIVO",
    });
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      athleteId: ATHLETE_ID,
      status: "RETORNO_PROGRESSIVO",
    });
  });

  it("returns 200 on success (PHYSIO)", async () => {
    vi.mocked(upsertRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(upsertRtp).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid status value", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: { status: "OVERDUE" },
    });
    expect(res.statusCode).toBe(400);
    expect(upsertRtp).not.toHaveBeenCalled();
  });

  it("returns 400 when status is missing", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: { notes: "Some notes" },
    });
    expect(res.statusCode).toBe(400);
    expect(upsertRtp).not.toHaveBeenCalled();
  });

  it("returns 400 when notes exceeds 2000 characters", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: { status: "AFASTADO", notes: "A".repeat(2001) },
    });
    expect(res.statusCode).toBe(400);
    expect(upsertRtp).not.toHaveBeenCalled();
  });

  it("returns 404 when athlete does not exist", async () => {
    vi.mocked(upsertRtp).mockRejectedValue(new AthleteNotFoundError());
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/athletes/nonexistent/rtp",
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });
  });

  it("returns 404 when medicalRecordId does not exist", async () => {
    vi.mocked(upsertRtp).mockRejectedValue(new MedicalRecordNotFoundError());
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: { status: "AFASTADO", medicalRecordId: "bad-record" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      message: "Prontuário não encontrado",
    });
  });

  it("returns 404 when protocolId does not exist", async () => {
    vi.mocked(upsertRtp).mockRejectedValue(new ProtocolNotFoundError());
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: { status: "AFASTADO", protocolId: "bad-protocol" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      message: "Protocolo não encontrado",
    });
  });

  it("passes clubId and actorId from JWT to the service", async () => {
    vi.mocked(upsertRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: VALID_BODY,
    });
    expect(upsertRtp).toHaveBeenCalledWith(
      expect.anything(),
      PHYSIO_USER.clubId,
      PHYSIO_USER.sub,
      ATHLETE_ID,
      expect.objectContaining({ status: "RETORNO_PROGRESSIVO" }),
    );
  });

  it("accepts optional fields: medicalRecordId, protocolId, notes", async () => {
    vi.mocked(upsertRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: {
        status: "AFASTADO",
        medicalRecordId: "record_001",
        protocolId: "protocol_001",
        notes: "Retorno em 14 dias",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(upsertRtp).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      ATHLETE_ID,
      expect.objectContaining({
        medicalRecordId: "record_001",
        protocolId: "protocol_001",
        notes: "Retorno em 14 dias",
      }),
    );
  });

  it("accepts LIBERADO as a valid status", async () => {
    vi.mocked(upsertRtp).mockResolvedValue({
      ...FULL_RTP_RESPONSE,
      status: "LIBERADO",
      clearedAt: "2025-06-01T10:00:00.000Z",
      clearedBy: ADMIN_USER.sub,
    });
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: { status: "LIBERADO" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "LIBERADO",
      clearedBy: ADMIN_USER.sub,
    });
  });

  it("strips unknown fields from the request body", async () => {
    vi.mocked(upsertRtp).mockResolvedValue(FULL_RTP_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: { status: "AFASTADO", athleteId: "should-be-stripped" },
    });
    const calledWith = vi.mocked(upsertRtp).mock.calls[0]?.[4];
    expect(calledWith).not.toHaveProperty("athleteId");
  });

  it("re-throws unexpected errors (results in 500)", async () => {
    vi.mocked(upsertRtp).mockRejectedValue(new Error("DB connection lost"));
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: `/athletes/${ATHLETE_ID}/rtp`,
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(500);
  });
});
