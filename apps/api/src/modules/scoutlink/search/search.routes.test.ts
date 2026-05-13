import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
} from "fastify";
import type { AccessTokenPayload } from "../../../types/fastify.js";

const mockSearchAthletes = vi.fn();

vi.mock("./search.service.js", () => ({
  searchAthletes: (...args: unknown[]) => mockSearchAthletes(...args),
}));

import { scoutSearchRoutes } from "./search.routes.js";

const SCOUT_USER: AccessTokenPayload = {
  sub: "scout_001",
  clubId: null,
  role: "SCOUT",
  type: "access",
};
const ADMIN_USER: AccessTokenPayload = {
  sub: "admin_001",
  clubId: "club_1",
  role: "ADMIN",
  type: "access",
};
const TREASURER_USER: AccessTokenPayload = {
  sub: "tr_001",
  clubId: "club_1",
  role: "TREASURER",
  type: "access",
};
const PHYSIO_USER: AccessTokenPayload = {
  sub: "ph_001",
  clubId: "club_1",
  role: "PHYSIO",
  type: "access",
};

const PAGINATED_RESULT = { data: [], total: 0, page: 1, limit: 20 };

async function buildApp(
  requestUser?: AccessTokenPayload,
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  fastify.decorate(
    "prisma",
    {} as import("../../../../generated/prisma/index.js").PrismaClient,
  );
  fastify.decorate(
    "verifyAccessToken",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.headers.authorization) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Missing or invalid access token.",
        });
      }
      request.user = requestUser ?? SCOUT_USER;
    },
  );
  fastify.decorate(
    "requireRole",
    (...allowedRoles: string[]) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user as AccessTokenPayload;
        if (!allowedRoles.includes(user.role)) {
          return reply.status(403).send({
            statusCode: 403,
            error: "Forbidden",
            message: "Insufficient permissions.",
          });
        }
      },
  );

  await fastify.register(scoutSearchRoutes, { prefix: "/api/scout/athletes" });
  await fastify.ready();
  return fastify;
}

let app: FastifyInstance;

beforeEach(() => {
  mockSearchAthletes.mockResolvedValue(PAGINATED_RESULT);
});

afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
});

describe("GET /api/scout/athletes — auth", () => {
  it("returns 401 without Authorization header", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/scout/athletes" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 for SCOUT role", async () => {
    app = await buildApp(SCOUT_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 403 for ADMIN role", async () => {
    app = await buildApp(ADMIN_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for TREASURER role", async () => {
    app = await buildApp(TREASURER_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 for PHYSIO role", async () => {
    app = await buildApp(PHYSIO_USER);
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /api/scout/athletes — validation", () => {
  beforeEach(async () => {
    app = await buildApp();
  });

  it("returns 400 when limit exceeds 50", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes?limit=51",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid rtpStatus value", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes?rtpStatus=INVALID",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 200 with default pagination when no params given", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSearchAthletes).toHaveBeenCalledWith(
      expect.anything(),
      SCOUT_USER.sub,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("passes parsed query params to searchAthletes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/scout/athletes?position=Atacante&minAge=18&maxAge=25&page=2&limit=10",
      headers: { authorization: "Bearer t" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockSearchAthletes).toHaveBeenCalledWith(
      expect.anything(),
      SCOUT_USER.sub,
      expect.objectContaining({
        position: "Atacante",
        minAge: 18,
        maxAge: 25,
        page: 2,
        limit: 10,
      }),
    );
  });
});
