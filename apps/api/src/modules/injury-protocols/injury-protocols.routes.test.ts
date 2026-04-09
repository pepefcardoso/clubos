import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { injuryProtocolRoutes } from "./injury-protocols.routes.js";
import { InjuryProtocolNotFoundError } from "./injury-protocols.service.js";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("./injury-protocols.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./injury-protocols.service.js")>();
  return {
    InjuryProtocolNotFoundError: original.InjuryProtocolNotFoundError,
    listInjuryProtocols: vi.fn(),
    getInjuryProtocolById: vi.fn(),
  };
});

import {
  listInjuryProtocols,
  getInjuryProtocolById,
} from "./injury-protocols.service.js";

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

const PHYSIO_USER: AccessTokenPayload = {
  sub: "user_physio_001",
  clubId: "testclubid0000000001",
  role: "PHYSIO",
  type: "access",
};

const PROTOCOL_SUMMARY = {
  id: "proto_hamstring_g1",
  name: "Hamstring Strain — Grade I",
  structure: "Hamstring",
  grade: "GRADE_1",
  durationDays: 7,
  isActive: true,
};

const PROTOCOL_FULL = {
  ...PROTOCOL_SUMMARY,
  source: "FIFA Medical 2023",
  steps: [
    { day: "1-2", activity: "PRICE protocol, cryotherapy 15min × 3/day" },
  ],
  createdAt: "2025-01-01T00:00:00.000Z",
};

const PAGINATED_RESPONSE = {
  data: [PROTOCOL_SUMMARY],
  total: 1,
  page: 1,
  limit: 50,
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
    (..._allowedRoles: Array<"ADMIN" | "TREASURER" | "PHYSIO">) => {
      return async (_request: FastifyRequest, _reply: FastifyReply) => {
        };
    },
  );

  app.addHook("preHandler", app.verifyAccessToken);

  await app.register(injuryProtocolRoutes, { prefix: "/injury-protocols" });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /injury-protocols", () => {
  it("returns 200 with paginated data for ADMIN", async () => {
    vi.mocked(listInjuryProtocols).mockResolvedValue(PAGINATED_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
  });

  it("returns 200 for TREASURER role", async () => {
    vi.mocked(listInjuryProtocols).mockResolvedValue(PAGINATED_RESPONSE);
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols",
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 200 for PHYSIO role", async () => {
    vi.mocked(listInjuryProtocols).mockResolvedValue(PAGINATED_RESPONSE);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols",
    });
    expect(res.statusCode).toBe(200);
  });

  it("passes structure filter to service", async () => {
    vi.mocked(listInjuryProtocols).mockResolvedValue(PAGINATED_RESPONSE);
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/injury-protocols?structure=Hamstring",
    });
    expect(listInjuryProtocols).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({ structure: "Hamstring" }),
    );
  });

  it("passes grade filter to service", async () => {
    vi.mocked(listInjuryProtocols).mockResolvedValue(PAGINATED_RESPONSE);
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/injury-protocols?grade=GRADE_2",
    });
    expect(listInjuryProtocols).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.objectContaining({ grade: "GRADE_2" }),
    );
  });

  it("returns 400 for invalid grade value", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols?grade=INVALID_GRADE",
    });
    expect(res.statusCode).toBe(400);
    expect(listInjuryProtocols).not.toHaveBeenCalled();
  });

  it("returns 400 for limit > 100", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols?limit=200",
    });
    expect(res.statusCode).toBe(400);
    expect(listInjuryProtocols).not.toHaveBeenCalled();
  });

  it("passes clubId from JWT to service", async () => {
    vi.mocked(listInjuryProtocols).mockResolvedValue(PAGINATED_RESPONSE);
    const app = await buildApp(ADMIN_USER);
    await app.inject({ method: "GET", url: "/injury-protocols" });
    expect(listInjuryProtocols).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_USER.clubId,
      expect.anything(),
    );
  });

  it("re-throws unexpected errors (results in 500)", async () => {
    vi.mocked(listInjuryProtocols).mockRejectedValue(
      new Error("DB connection lost"),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols",
    });
    expect(res.statusCode).toBe(500);
  });
});

describe("GET /injury-protocols/:protocolId", () => {
  it("returns 200 with full protocol including steps", async () => {
    vi.mocked(getInjuryProtocolById).mockResolvedValue(PROTOCOL_FULL);
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/injury-protocols/proto_hamstring_g1`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe("proto_hamstring_g1");
    expect(body.steps).toBeInstanceOf(Array);
    expect(body.steps.length).toBeGreaterThan(0);
  });

  it("returns 404 when protocol does not exist", async () => {
    vi.mocked(getInjuryProtocolById).mockRejectedValue(
      new InjuryProtocolNotFoundError(),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols/nonexistent",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      message: "Protocolo não encontrado",
    });
  });

  it("returns 404 when protocol is inactive", async () => {
    vi.mocked(getInjuryProtocolById).mockRejectedValue(
      new InjuryProtocolNotFoundError(),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols/proto_inactive",
    });
    expect(res.statusCode).toBe(404);
  });

  it("passes clubId from JWT to service", async () => {
    vi.mocked(getInjuryProtocolById).mockResolvedValue(PROTOCOL_FULL);
    const app = await buildApp(PHYSIO_USER);
    await app.inject({
      method: "GET",
      url: "/injury-protocols/proto_hamstring_g1",
    });
    expect(getInjuryProtocolById).toHaveBeenCalledWith(
      expect.anything(),
      PHYSIO_USER.clubId,
      "proto_hamstring_g1",
    );
  });

  it("accessible by TREASURER role", async () => {
    vi.mocked(getInjuryProtocolById).mockResolvedValue(PROTOCOL_FULL);
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols/proto_hamstring_g1",
    });
    expect(res.statusCode).toBe(200);
  });

  it("re-throws unexpected errors (results in 500)", async () => {
    vi.mocked(getInjuryProtocolById).mockRejectedValue(
      new Error("DB connection lost"),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/injury-protocols/proto_hamstring_g1",
    });
    expect(res.statusCode).toBe(500);
  });
});
