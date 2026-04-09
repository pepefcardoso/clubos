import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { medicalRecordRoutes } from "./medical-records.routes.js";
import {
  MedicalRecordNotFoundError,
  AthleteNotFoundError,
  ProtocolNotFoundError,
} from "./medical-records.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./medical-records.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./medical-records.service.js")>();
  return {
    MedicalRecordNotFoundError: original.MedicalRecordNotFoundError,
    AthleteNotFoundError: original.AthleteNotFoundError,
    ProtocolNotFoundError: original.ProtocolNotFoundError,
    createMedicalRecord: vi.fn(),
    getMedicalRecordById: vi.fn(),
    updateMedicalRecord: vi.fn(),
    deleteMedicalRecord: vi.fn(),
    listMedicalRecords: vi.fn(),
  };
});

import {
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord,
  listMedicalRecords,
} from "./medical-records.service.js";

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

const RECORD_RESPONSE = {
  id: "record_001",
  athleteId: "athlete_001",
  athleteName: "Rogério Silva",
  protocolId: null,
  occurredAt: "2025-03-10",
  structure: "Ligamento cruzado anterior",
  grade: "GRADE_2",
  mechanism: "NON_CONTACT",
  clinicalNotes: "Dor intensa na flexão",
  diagnosis: "Ruptura parcial do LCA",
  treatmentDetails: "Crioterapia e imobilização",
  createdBy: "user_physio_001",
  createdAt: "2025-03-10T09:00:00.000Z",
  updatedAt: "2025-03-10T09:00:00.000Z",
};

const SUMMARY_RESPONSE = {
  id: "record_001",
  athleteId: "athlete_001",
  athleteName: "Rogério Silva",
  protocolId: null,
  occurredAt: "2025-03-10",
  structure: "Ligamento cruzado anterior",
  grade: "GRADE_2",
  mechanism: "NON_CONTACT",
  createdBy: "user_physio_001",
  createdAt: "2025-03-10T09:00:00.000Z",
};

const VALID_CREATE_BODY = {
  athleteId: "athlete_001",
  occurredAt: "2025-03-10",
  structure: "Ligamento cruzado anterior",
  grade: "GRADE_2",
  mechanism: "NON_CONTACT",
  clinicalNotes: "Dor intensa na flexão",
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

  app.addHook("preHandler", app.verifyAccessToken);

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

  await app.register(medicalRecordRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /medical-records (list)", () => {
  it("returns 200 with paginated data for ADMIN", async () => {
    const page = { data: [SUMMARY_RESPONSE], total: 1, page: 1, limit: 20 };
    vi.mocked(listMedicalRecords).mockResolvedValue(page);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      total: 1,
      data: [{ id: "record_001" }],
    });
  });

  it("is accessible by PHYSIO role", async () => {
    vi.mocked(listMedicalRecords).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(403);
    expect(listMedicalRecords).not.toHaveBeenCalled();
  });

  it("passes athleteId query param to the service", async () => {
    vi.mocked(listMedicalRecords).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/?athleteId=athlete_001" });
    expect(listMedicalRecords).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({ athleteId: "athlete_001" }),
      ADMIN_USER.sub,
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );
  });

  it("passes grade query param to the service", async () => {
    vi.mocked(listMedicalRecords).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/?grade=GRADE_3" });
    expect(listMedicalRecords).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({ grade: "GRADE_3" }),
      ADMIN_USER.sub,
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );
  });

  it("returns 400 for invalid limit (> 100)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/?limit=999" });
    expect(res.statusCode).toBe(400);
    expect(listMedicalRecords).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid grade value", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/?grade=INVALID" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /medical-records (create)", () => {
  it("returns 201 with created record (ADMIN)", async () => {
    vi.mocked(createMedicalRecord).mockResolvedValue(RECORD_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      id: "record_001",
      athleteName: "Rogério Silva",
    });
  });

  it("returns 201 with created record (PHYSIO)", async () => {
    vi.mocked(createMedicalRecord).mockResolvedValue(RECORD_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(createMedicalRecord).not.toHaveBeenCalled();
  });

  it("returns 404 when athlete does not exist", async () => {
    vi.mocked(createMedicalRecord).mockRejectedValue(
      new AthleteNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: VALID_CREATE_BODY,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("returns 404 when protocol does not exist", async () => {
    vi.mocked(createMedicalRecord).mockRejectedValue(
      new ProtocolNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, protocolId: "bad-id" },
    });
    expect(res.statusCode).toBe(404);
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
    expect(createMedicalRecord).not.toHaveBeenCalled();
  });

  it("returns 400 for missing required field (occurredAt)", async () => {
    const app = await buildApp(ADMIN_USER);
    const { occurredAt: _, ...without } = VALID_CREATE_BODY;
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: without,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, occurredAt: "10/03/2025" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid grade value", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, grade: "GRADE_99" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid mechanism value", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...VALID_CREATE_BODY, mechanism: "MAGIC" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("re-throws unexpected errors (results in 500)", async () => {
    vi.mocked(createMedicalRecord).mockRejectedValue(
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
    vi.mocked(createMedicalRecord).mockResolvedValue(RECORD_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    await app.inject({ method: "POST", url: "/", payload: VALID_CREATE_BODY });
    expect(createMedicalRecord).toHaveBeenCalledWith(
      expect.anything(),
      PHYSIO_USER.clubId,
      PHYSIO_USER.sub,
      expect.objectContaining({ athleteId: "athlete_001" }),
    );
  });
});

describe("GET /medical-records/:recordId (get by id)", () => {
  it("returns 200 with full record including clinical fields (ADMIN)", async () => {
    vi.mocked(getMedicalRecordById).mockResolvedValue(RECORD_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "GET", url: "/record_001" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: "record_001",
      clinicalNotes: "Dor intensa na flexão",
    });
  });

  it("returns 200 for PHYSIO role", async () => {
    vi.mocked(getMedicalRecordById).mockResolvedValue(RECORD_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({ method: "GET", url: "/record_001" });
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/record_001" });
    expect(res.statusCode).toBe(403);
    expect(getMedicalRecordById).not.toHaveBeenCalled();
  });

  it("returns 404 when service throws MedicalRecordNotFoundError", async () => {
    vi.mocked(getMedicalRecordById).mockRejectedValue(
      new MedicalRecordNotFoundError(),
    );
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("forwards actorId and clubId to the service", async () => {
    vi.mocked(getMedicalRecordById).mockResolvedValue(RECORD_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    await app.inject({ method: "GET", url: "/record_001" });
    expect(getMedicalRecordById).toHaveBeenCalledWith(
      expect.anything(),
      PHYSIO_USER.clubId,
      "record_001",
      PHYSIO_USER.sub,
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );
  });
});

describe("PUT /medical-records/:recordId (update)", () => {
  it("returns 200 with updated record (ADMIN)", async () => {
    vi.mocked(updateMedicalRecord).mockResolvedValue({
      ...RECORD_RESPONSE,
      grade: "GRADE_3",
    });
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/record_001",
      payload: { grade: "GRADE_3" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ grade: "GRADE_3" });
  });

  it("returns 200 for PHYSIO role", async () => {
    vi.mocked(updateMedicalRecord).mockResolvedValue(RECORD_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/record_001",
      payload: { structure: "Tornozelo" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/record_001",
      payload: { grade: "GRADE_1" },
    });
    expect(res.statusCode).toBe(403);
    expect(updateMedicalRecord).not.toHaveBeenCalled();
  });

  it("returns 404 when record does not exist", async () => {
    vi.mocked(updateMedicalRecord).mockRejectedValue(
      new MedicalRecordNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/nonexistent",
      payload: { grade: "GRADE_1" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 when protocol does not exist", async () => {
    vi.mocked(updateMedicalRecord).mockRejectedValue(
      new ProtocolNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/record_001",
      payload: { protocolId: "bad" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for invalid grade value in update", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/record_001",
      payload: { grade: "GRADE_99" },
    });
    expect(res.statusCode).toBe(400);
    expect(updateMedicalRecord).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid date format in update", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/record_001",
      payload: { occurredAt: "not-a-date" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts partial update with only notes", async () => {
    vi.mocked(updateMedicalRecord).mockResolvedValue({
      ...RECORD_RESPONSE,
      clinicalNotes: "Updated notes",
    });
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/record_001",
      payload: { clinicalNotes: "Updated notes" },
    });
    expect(res.statusCode).toBe(200);
    expect(updateMedicalRecord).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      "record_001",
      expect.objectContaining({ clinicalNotes: "Updated notes" }),
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );
  });
});

describe("DELETE /medical-records/:recordId (delete)", () => {
  it("returns 204 on successful delete (ADMIN)", async () => {
    vi.mocked(deleteMedicalRecord).mockResolvedValue(undefined);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/record_001" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 204 on successful delete (PHYSIO)", async () => {
    vi.mocked(deleteMedicalRecord).mockResolvedValue(undefined);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({ method: "DELETE", url: "/record_001" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 403 when called by TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "DELETE", url: "/record_001" });
    expect(res.statusCode).toBe(403);
    expect(deleteMedicalRecord).not.toHaveBeenCalled();
  });

  it("returns 404 when record does not exist", async () => {
    vi.mocked(deleteMedicalRecord).mockRejectedValue(
      new MedicalRecordNotFoundError(),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "DELETE", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("passes clubId and actorId to the service", async () => {
    vi.mocked(deleteMedicalRecord).mockResolvedValue(undefined);
    const app = await buildApp(PHYSIO_USER);
    await app.inject({ method: "DELETE", url: "/record_001" });
    expect(deleteMedicalRecord).toHaveBeenCalledWith(
      expect.anything(),
      PHYSIO_USER.clubId,
      PHYSIO_USER.sub,
      "record_001",
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );
  });
});
