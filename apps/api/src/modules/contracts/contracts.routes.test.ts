import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { contractRoutes } from "./contracts.routes.js";
import {
  ContractNotFoundError,
  ActiveContractAlreadyExistsError,
  ContractAlreadyTerminatedError,
  AthleteNotFoundError,
} from "./contracts.service.js";
import type { ContractResponse } from "./contracts.schema.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./contracts.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./contracts.service.js")>();
  return {
    ContractNotFoundError: original.ContractNotFoundError,
    ActiveContractAlreadyExistsError: original.ActiveContractAlreadyExistsError,
    ContractAlreadyTerminatedError: original.ContractAlreadyTerminatedError,
    AthleteNotFoundError: original.AthleteNotFoundError,
    createContract: vi.fn(),
    getContractById: vi.fn(),
    updateContract: vi.fn(),
    listContracts: vi.fn(),
  };
});

import {
  createContract,
  getContractById,
  updateContract,
  listContracts,
} from "./contracts.service.js";

const CONTRACT: ContractResponse = {
  id: "contract_abc123",
  athleteId: "athlete_xyz",
  type: "PROFESSIONAL",
  status: "ACTIVE",
  startDate: new Date("2024-01-01"),
  endDate: null,
  bidRegistered: false,
  federationCode: null,
  notes: null,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
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

/**
 * Builds a minimal Fastify instance with:
 *   - a stub prisma decorator
 *   - stub verifyAccessToken that injects `user` based on the role param
 *   - stub requireRole that enforces ADMIN-only on POST/PUT routes
 *   - contract routes registered at "/"
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

  await app.register(contractRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /contracts (list)", () => {
  it("returns 200 with paginated data from the service", async () => {
    const page = { data: [CONTRACT], total: 1, page: 1, limit: 20 };
    vi.mocked(listContracts).mockResolvedValue(page);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 1, data: [{ id: CONTRACT.id }] });
  });

  it("passes parsed query params to the service", async () => {
    vi.mocked(listContracts).mockResolvedValue({
      data: [],
      total: 0,
      page: 2,
      limit: 10,
    });

    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/?page=2&limit=10&status=TERMINATED&athleteId=athlete_xyz",
    });

    expect(listContracts).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({
        page: 2,
        limit: 10,
        status: "TERMINATED",
        athleteId: "athlete_xyz",
      }),
    );
  });

  it("passes clubId from JWT to the service", async () => {
    vi.mocked(listContracts).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "GET", url: "/" });

    expect(listContracts).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.anything(),
    );
  });

  it("returns 400 for invalid query params", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/?limit=999" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "Bad Request" });
    expect(listContracts).not.toHaveBeenCalled();
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(listContracts).mockResolvedValue({
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

describe("GET /contracts/:contractId (get by id)", () => {
  it("returns 200 with the contract data", async () => {
    vi.mocked(getContractById).mockResolvedValue(CONTRACT);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/contract_abc123" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: CONTRACT.id });
  });

  it("passes clubId from JWT to the service", async () => {
    vi.mocked(getContractById).mockResolvedValue(CONTRACT);

    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "GET", url: "/contract_abc123" });

    expect(getContractById).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      "contract_abc123",
    );
  });

  it("returns 404 when the service throws ContractNotFoundError", async () => {
    vi.mocked(getContractById).mockRejectedValue(new ContractNotFoundError());

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nonexistent" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Contrato não encontrado",
    });
  });

  it("re-throws unexpected service errors (results in 500)", async () => {
    vi.mocked(getContractById).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/contract_abc123" });

    expect(res.statusCode).toBe(500);
  });

  it("is accessible by TREASURER role", async () => {
    vi.mocked(getContractById).mockResolvedValue(CONTRACT);

    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/contract_abc123" });

    expect(res.statusCode).toBe(200);
  });
});

describe("POST /contracts (create)", () => {
  const validBody = {
    athleteId: "athlete_xyz",
    type: "PROFESSIONAL",
    startDate: "2024-01-01",
  };

  it("returns 201 with the created contract (ADMIN)", async () => {
    vi.mocked(createContract).mockResolvedValue(CONTRACT);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: CONTRACT.id, type: CONTRACT.type });
  });

  it("passes clubId and actorId from the JWT to the service", async () => {
    vi.mocked(createContract).mockResolvedValue(CONTRACT);

    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "POST", url: "/", payload: validBody });

    expect(createContract).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      expect.objectContaining({
        athleteId: "athlete_xyz",
        type: "PROFESSIONAL",
      }),
    );
  });

  it("returns 404 when the service throws AthleteNotFoundError", async () => {
    vi.mocked(createContract).mockRejectedValue(new AthleteNotFoundError());

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });
  });

  it("returns 409 when the service throws ActiveContractAlreadyExistsError", async () => {
    vi.mocked(createContract).mockRejectedValue(
      new ActiveContractAlreadyExistsError(),
    );

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
    });
  });

  it("returns 400 for a payload missing required fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { athleteId: "athlete_xyz" },
    });

    expect(res.statusCode).toBe(400);
    expect(createContract).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid type value", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...validBody, type: "INTERNSHIP" },
    });

    expect(res.statusCode).toBe(400);
    expect(createContract).not.toHaveBeenCalled();
  });

  it("returns 400 for a bad startDate format", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { ...validBody, startDate: "01/01/2024" },
    });

    expect(res.statusCode).toBe(400);
    expect(createContract).not.toHaveBeenCalled();
  });

  it("returns 403 when called by a TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(403);
    expect(createContract).not.toHaveBeenCalled();
  });

  it("re-throws unexpected service errors (results in 500)", async () => {
    vi.mocked(createContract).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: validBody,
    });

    expect(res.statusCode).toBe(500);
  });
});

describe("PUT /contracts/:contractId (update)", () => {
  const validUpdate = { status: "EXPIRED" as const };

  it("returns 200 with the updated contract (ADMIN)", async () => {
    const updated = { ...CONTRACT, status: "EXPIRED" };
    vi.mocked(updateContract).mockResolvedValue(updated);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: validUpdate,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "EXPIRED" });
  });

  it("passes clubId and actorId from the JWT to the service", async () => {
    vi.mocked(updateContract).mockResolvedValue(CONTRACT);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: { bidRegistered: true },
    });

    expect(updateContract).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      ADMIN_USER.sub,
      "contract_abc123",
      expect.objectContaining({ bidRegistered: true }),
    );
  });

  it("returns 404 when the service throws ContractNotFoundError", async () => {
    vi.mocked(updateContract).mockRejectedValue(new ContractNotFoundError());

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/nonexistent",
      payload: validUpdate,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, error: "Not Found" });
  });

  it("returns 409 when setting status=ACTIVE causes a conflict", async () => {
    vi.mocked(updateContract).mockRejectedValue(
      new ActiveContractAlreadyExistsError(),
    );

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: { status: "ACTIVE" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ statusCode: 409, error: "Conflict" });
  });

  it("returns 422 when attempting to modify a TERMINATED contract", async () => {
    vi.mocked(updateContract).mockRejectedValue(
      new ContractAlreadyTerminatedError(),
    );

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: { notes: "trying to change" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      statusCode: 422,
      error: "Unprocessable Entity",
    });
  });

  it("returns 400 for an invalid status value", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: { status: "OVERDUE" },
    });

    expect(res.statusCode).toBe(400);
    expect(updateContract).not.toHaveBeenCalled();
  });

  it("does NOT accept athleteId in the update body (immutable field stripped)", async () => {
    vi.mocked(updateContract).mockResolvedValue(CONTRACT);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: { status: "EXPIRED", athleteId: "should-be-stripped" },
    });

    const calledWith = vi.mocked(updateContract).mock.calls[0]?.[4];
    expect(calledWith).not.toHaveProperty("athleteId");
  });

  it("does NOT accept type in the update body (immutable field stripped)", async () => {
    vi.mocked(updateContract).mockResolvedValue(CONTRACT);

    const app = await buildApp(ADMIN_USER);
    await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: { status: "EXPIRED", type: "LOAN" },
    });

    const calledWith = vi.mocked(updateContract).mock.calls[0]?.[4];
    expect(calledWith).not.toHaveProperty("type");
  });

  it("returns 403 when called by a TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: validUpdate,
    });

    expect(res.statusCode).toBe(403);
    expect(updateContract).not.toHaveBeenCalled();
  });

  it("accepts an empty object (partial update with no changes)", async () => {
    vi.mocked(updateContract).mockResolvedValue(CONTRACT);

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });

  it("re-throws unexpected service errors (results in 500)", async () => {
    vi.mocked(updateContract).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "PUT",
      url: "/contract_abc123",
      payload: validUpdate,
    });

    expect(res.statusCode).toBe(500);
  });
});
