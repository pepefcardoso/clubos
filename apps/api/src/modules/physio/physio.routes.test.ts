import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { physioRoutes } from "./physio.routes.js";
import {
  getPhysioClubs,
  validatePhysioClubSwitch,
  grantPhysioClubAccess,
  revokePhysioClubAccess,
} from "./physio.service.js";
import { getMultiClubAtRiskAthletes } from "./physio.dashboard.service.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";

vi.mock("./physio.service.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./physio.service.js")>();
  return {
    ...orig,
    getPhysioClubs: vi.fn(),
    validatePhysioClubSwitch: vi.fn(),
    grantPhysioClubAccess: vi.fn(),
    revokePhysioClubAccess: vi.fn(),
  };
});

vi.mock("./physio-dashboard.service.js", () => ({
  getMultiClubAtRiskAthletes: vi.fn(),
}));

const PHYSIO_USER: AccessTokenPayload = {
  sub: "user_physio_001",
  clubId: "clubabc0000000000001",
  role: "PHYSIO",
  type: "access",
};

const ADMIN_USER: AccessTokenPayload = {
  sub: "user_admin_001",
  clubId: "clubabc0000000000001",
  role: "ADMIN",
  type: "access",
};

const TREASURER_USER: AccessTokenPayload = {
  sub: "user_treasurer_001",
  clubId: "clubabc0000000000001",
  role: "TREASURER",
  type: "access",
};

async function buildApp(
  userPayload: AccessTokenPayload = PHYSIO_USER,
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

  app.jwt = { sign: vi.fn(() => "new-access-token") } as never;

  await app.register(physioRoutes, { prefix: "/" });
  await app.ready();
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /physio/clubs", () => {
  it("returns 200 with clubs list for PHYSIO", async () => {
    vi.mocked(getPhysioClubs).mockResolvedValue([
      {
        clubId: "clubabc0000000000001",
        clubName: "Clube A",
        clubLogoUrl: null,
        isPrimary: true,
      },
      {
        clubId: "clubxyz0000000000002",
        clubName: "Clube B",
        clubLogoUrl: null,
        isPrimary: false,
      },
    ]);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({ method: "GET", url: "/clubs" });
    expect(res.statusCode).toBe(200);
    expect(res.json().clubs).toHaveLength(2);
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/clubs" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for ADMIN (endpoint is PHYSIO-only)", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "GET", url: "/clubs" });
    expect(res.statusCode).toBe(403);
  });

  it("propagates ForbiddenError from service as 403", async () => {
    vi.mocked(getPhysioClubs).mockRejectedValue(
      new ForbiddenError("Acesso negado"),
    );
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({ method: "GET", url: "/clubs" });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /physio/switch-club", () => {
  it("returns 200 with new accessToken when switch is valid", async () => {
    vi.mocked(validatePhysioClubSwitch).mockResolvedValue(undefined);
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "POST",
      url: "/switch-club",
      payload: { targetClubId: "clubxyz0000000000002" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("accessToken");
  });

  it("returns 403 for ADMIN", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/switch-club",
      payload: { targetClubId: "clubxyz0000000000002" },
    });
    expect(res.statusCode).toBe(403);
    expect(validatePhysioClubSwitch).not.toHaveBeenCalled();
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "POST",
      url: "/switch-club",
      payload: { targetClubId: "clubxyz0000000000002" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 400 for missing targetClubId", async () => {
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "POST",
      url: "/switch-club",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 when service throws ForbiddenError", async () => {
    vi.mocked(validatePhysioClubSwitch).mockRejectedValue(
      new ForbiddenError("Acesso não autorizado"),
    );
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "POST",
      url: "/switch-club",
      payload: { targetClubId: "clubxyz0000000000002" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /physio/dashboard", () => {
  it("returns 200 with aggregated athletes for PHYSIO", async () => {
    vi.mocked(getMultiClubAtRiskAthletes).mockResolvedValue({
      athletes: [],
      clubCount: 2,
      acwrDataAsOf: null,
    });
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({ method: "GET", url: "/dashboard" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ clubCount: 2 });
  });

  it("passes minAcwr query param to service", async () => {
    vi.mocked(getMultiClubAtRiskAthletes).mockResolvedValue({
      athletes: [],
      clubCount: 1,
      acwrDataAsOf: null,
    });
    const app = await buildApp(PHYSIO_USER);
    await app.inject({ method: "GET", url: "/dashboard?minAcwr=1.5" });
    expect(getMultiClubAtRiskAthletes).toHaveBeenCalledWith(
      expect.anything(),
      PHYSIO_USER.sub,
      1.5,
    );
  });

  it("returns 403 for TREASURER", async () => {
    const app = await buildApp(TREASURER_USER);
    const res = await app.inject({ method: "GET", url: "/dashboard" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for ADMIN", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({ method: "GET", url: "/dashboard" });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /physio/club-access", () => {
  it("returns 201 on successful grant (ADMIN)", async () => {
    vi.mocked(grantPhysioClubAccess).mockResolvedValue({ id: "access_001" });
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/club-access",
      payload: {
        physioUserId: "user_physio_001",
        targetClubId: "clubabc0000000000001",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: "access_001" });
  });

  it("returns 403 for PHYSIO trying to grant access", async () => {
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "POST",
      url: "/club-access",
      payload: {
        physioUserId: "user_physio_002",
        targetClubId: "clubabc0000000000001",
      },
    });
    expect(res.statusCode).toBe(403);
    expect(grantPhysioClubAccess).not.toHaveBeenCalled();
  });

  it("returns 400 for missing physioUserId", async () => {
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/club-access",
      payload: { targetClubId: "clubabc0000000000001" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when service throws NotFoundError", async () => {
    vi.mocked(grantPhysioClubAccess).mockRejectedValue(new NotFoundError());
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "POST",
      url: "/club-access",
      payload: {
        physioUserId: "user_physio_001",
        targetClubId: "clubabc0000000000001",
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /physio/club-access/:accessId", () => {
  it("returns 204 on successful revoke (ADMIN)", async () => {
    vi.mocked(revokePhysioClubAccess).mockResolvedValue(undefined);
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/club-access/access_001",
    });
    expect(res.statusCode).toBe(204);
  });

  it("returns 403 for PHYSIO", async () => {
    const app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/club-access/access_001",
    });
    expect(res.statusCode).toBe(403);
    expect(revokePhysioClubAccess).not.toHaveBeenCalled();
  });

  it("returns 404 when access row not found", async () => {
    vi.mocked(revokePhysioClubAccess).mockRejectedValue(new NotFoundError());
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/club-access/nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when ADMIN does not own the access row", async () => {
    vi.mocked(revokePhysioClubAccess).mockRejectedValue(
      new ForbiddenError("Apenas o ADMIN do clube pode revogar este acesso."),
    );
    const app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "DELETE",
      url: "/club-access/access_001",
    });
    expect(res.statusCode).toBe(403);
  });
});
