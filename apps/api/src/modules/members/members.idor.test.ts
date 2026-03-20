/**
 * Simulates a cross-tenant attack: Club B's JWT attempts to access resources
 * that belong to Club A. Every cross-tenant request must return 404 (not 200,
 * not 403 — returning 403 would confirm the resource exists).
 *
 * Strategy: two "clubs" are emulated by two different JWT payloads. The mock
 * `withTenantSchema` is configured to return data only for club-A's resources;
 * calls with club-B's context resolve to null/empty, triggering the 404 path.
 *
 * Covers: members, charges, athletes (per §7 of the guideline).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { AccessTokenPayload } from "../../types/fastify.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn().mockReturnValue({}),
  storeRefreshToken: vi.fn(),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));

vi.mock("../../lib/whatsapp-rate-limit.js", () => ({
  checkAndConsumeWhatsAppRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: false, retryAfterMs: 0 }),
}));

vi.mock("../messages/messages.service.js", () => ({
  hasRecentMessage: vi.fn().mockResolvedValue(true),
}));

vi.mock("../templates/templates.service.js", () => ({
  buildRenderedMessage: vi.fn(),
}));

vi.mock("../whatsapp/whatsapp.service.js", () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock("../templates/templates.constants.js", () => ({
  TEMPLATE_KEYS: { CHARGE_REMINDER_MANUAL: "charge_reminder_manual" },
}));

vi.mock("./members-import.service.js", () => ({
  importMembersFromCsv: vi.fn(),
}));

const CLUB_A_ID = "club_aaa_000000000001";
const CLUB_B_ID = "club_bbb_000000000002";

const MEMBER_IN_A = { id: "mem_in_a_001" };
const CHARGE_IN_A = { id: "chg_in_a_001" };
const ATHLETE_IN_A = { id: "ath_in_a_001" };

/**
 * Builds a fake tx that resolves findUnique based on the active clubId.
 * When the route runs under Club B's context, the same IDs (from Club A)
 * return null because those rows do not exist in Club B's schema.
 */
function makeFakeTxForClub(activeClubId: string) {
  return {
    member: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          activeClubId === CLUB_A_ID && where.id === MEMBER_IN_A.id
            ? MEMBER_IN_A
            : null,
        ),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    charge: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          activeClubId === CLUB_A_ID && where.id === CHARGE_IN_A.id
            ? CHARGE_IN_A
            : null,
        ),
      update: vi.fn(),
    },
    athlete: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: { where: { id: string } }) =>
          activeClubId === CLUB_A_ID && where.id === ATHLETE_IN_A.id
            ? ATHLETE_IN_A
            : null,
        ),
    },
  };
}

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      clubId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(makeFakeTxForClub(clubId)),
  ),
  getPrismaClient: vi.fn().mockReturnValue({}),
  isPrismaUniqueConstraintError: vi.fn().mockReturnValue(false),
}));

vi.mock("./members.service.js", () => ({
  listMembers: vi
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
  getMemberById: vi.fn().mockResolvedValue(MEMBER_IN_A),
  updateMember: vi.fn().mockResolvedValue(MEMBER_IN_A),
  createMember: vi.fn().mockResolvedValue(MEMBER_IN_A),
  DuplicateCpfError: class extends Error {
    constructor() {
      super("dup");
      this.name = "DuplicateCpfError";
    }
  },
  PlanNotFoundError: class extends Error {
    constructor() {
      super("pnf");
      this.name = "PlanNotFoundError";
    }
  },
  MemberNotFoundError: class extends Error {
    constructor() {
      super("mnf");
      this.name = "MemberNotFoundError";
    }
  },
}));

vi.mock("../charges/charges.service.js", () => ({
  generateMonthlyCharges: vi.fn(),
  NoActivePlanError: class extends Error {
    constructor() {
      super("nap");
      this.name = "NoActivePlanError";
    }
  },
}));

vi.mock("../charges/charges.list.service.js", () => ({
  listCharges: vi
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
}));

vi.mock("../athletes/athletes.service.js", () => ({
  listAthletes: vi
    .fn()
    .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
  createAthlete: vi.fn().mockResolvedValue(ATHLETE_IN_A),
  getAthleteById: vi.fn().mockResolvedValue(ATHLETE_IN_A),
  updateAthlete: vi.fn().mockResolvedValue(ATHLETE_IN_A),
  DuplicateAthleteCpfError: class extends Error {
    constructor() {
      super("dup");
      this.name = "DuplicateAthleteCpfError";
    }
  },
  AthleteNotFoundError: class extends Error {
    constructor() {
      super("anf");
      this.name = "AthleteNotFoundError";
    }
  },
}));

import { memberRoutes } from "./members.routes.js";
import { chargeRoutes } from "../charges/charges.routes.js";
import { athleteRoutes } from "../athletes/athletes.routes.js";

async function buildApp(user: AccessTokenPayload): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.decorate("prisma", {} as PrismaClient);

  app.decorate("verifyAccessToken", async (request: FastifyRequest) => {
    (request as FastifyRequest & { user: AccessTokenPayload }).user = user;
    (request as FastifyRequest & { actorId: string }).actorId = user.sub;
  });

  app.decorate(
    "requireRole",
    (_role: "ADMIN" | "TREASURER") =>
      async (_req: FastifyRequest, _rep: FastifyReply) => {
        /* allow all */
      },
  );

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const r = request as FastifyRequest & {
      user?: AccessTokenPayload;
      actorId?: string;
    };
    if (r.user) r.actorId = r.user.sub;
  });

  await app.register(memberRoutes, { prefix: "/api/members" });
  await app.register(chargeRoutes, { prefix: "/api/charges" });
  await app.register(athleteRoutes, { prefix: "/api/athletes" });
  await app.ready();
  return app;
}

const CLUB_A_USER: AccessTokenPayload = {
  sub: "user_a",
  clubId: CLUB_A_ID,
  role: "ADMIN",
  type: "access",
};
const CLUB_B_USER: AccessTokenPayload = {
  sub: "user_b",
  clubId: CLUB_B_ID,
  role: "ADMIN",
  type: "access",
};

describe("IDOR protection — GET /api/members/:id", () => {
  let appA: FastifyInstance;
  let appB: FastifyInstance;

  beforeEach(async () => {
    appA = await buildApp(CLUB_A_USER);
    appB = await buildApp(CLUB_B_USER);
  });

  afterEach(async () => {
    await appA.close();
    await appB.close();
  });

  it("returns 200 for a legitimate same-club request (Club A → mem_in_a)", async () => {
    const res = await appA.inject({
      method: "GET",
      url: `/api/members/${MEMBER_IN_A.id}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 when Club B requests a member ID that belongs to Club A", async () => {
    const res = await appB.inject({
      method: "GET",
      url: `/api/members/${MEMBER_IN_A.id}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("cross-tenant 404 body has standard error shape (not 403)", async () => {
    const res = await appB.inject({
      method: "GET",
      url: `/api/members/${MEMBER_IN_A.id}`,
    });
    const body = res.json();
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe("Not Found");
    expect(body).not.toHaveProperty("clubId");
  });
});

describe("IDOR protection — PUT /api/members/:id", () => {
  let appA: FastifyInstance;
  let appB: FastifyInstance;

  beforeEach(async () => {
    appA = await buildApp(CLUB_A_USER);
    appB = await buildApp(CLUB_B_USER);
  });

  afterEach(async () => {
    await appA.close();
    await appB.close();
  });

  it("returns 200 when Club A updates its own member", async () => {
    const res = await appA.inject({
      method: "PUT",
      url: `/api/members/${MEMBER_IN_A.id}`,
      payload: { name: "Updated Name" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 (not 200, not 403) when Club B tries to update Club A's member", async () => {
    const res = await appB.inject({
      method: "PUT",
      url: `/api/members/${MEMBER_IN_A.id}`,
      payload: { name: "Hijacked" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("IDOR protection — GET /api/charges/:id", () => {
  let appA: FastifyInstance;
  let appB: FastifyInstance;

  beforeEach(async () => {
    appA = await buildApp(CLUB_A_USER);
    appB = await buildApp(CLUB_B_USER);
  });

  afterEach(async () => {
    await appA.close();
    await appB.close();
  });

  it("returns 200 for Club A accessing its own charge", async () => {
    const res = await appA.inject({
      method: "GET",
      url: `/api/charges/${CHARGE_IN_A.id}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 when Club B requests Club A's charge ID", async () => {
    const res = await appB.inject({
      method: "GET",
      url: `/api/charges/${CHARGE_IN_A.id}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("cross-tenant 404 does not expose any Club A data", async () => {
    const res = await appB.inject({
      method: "GET",
      url: `/api/charges/${CHARGE_IN_A.id}`,
    });
    const body = res.json<Record<string, unknown>>();
    expect(body).not.toHaveProperty("amountCents");
    expect(body).not.toHaveProperty("memberId");
  });
});

describe("IDOR protection — POST /api/charges/:id/cancel", () => {
  let appA: FastifyInstance;
  let appB: FastifyInstance;

  beforeEach(async () => {
    appA = await buildApp(CLUB_A_USER);
    appB = await buildApp(CLUB_B_USER);
  });

  afterEach(async () => {
    await appA.close();
    await appB.close();
  });

  it("returns 404 when Club B attempts to cancel Club A's charge", async () => {
    const res = await appB.inject({
      method: "POST",
      url: `/api/charges/${CHARGE_IN_A.id}/cancel`,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("IDOR protection — GET /api/athletes/:id", () => {
  let appA: FastifyInstance;
  let appB: FastifyInstance;

  beforeEach(async () => {
    appA = await buildApp(CLUB_A_USER);
    appB = await buildApp(CLUB_B_USER);
  });

  afterEach(async () => {
    await appA.close();
    await appB.close();
  });

  it("returns 200 for Club A accessing its own athlete", async () => {
    const res = await appA.inject({
      method: "GET",
      url: `/api/athletes/${ATHLETE_IN_A.id}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 404 when Club B requests Club A's athlete ID", async () => {
    const res = await appB.inject({
      method: "GET",
      url: `/api/athletes/${ATHLETE_IN_A.id}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("cross-tenant 404 body is 404, never 403", async () => {
    const res = await appB.inject({
      method: "GET",
      url: `/api/athletes/${ATHLETE_IN_A.id}`,
    });
    expect(res.json<{ statusCode: number }>().statusCode).toBe(404);
  });
});

describe("IDOR protection — PUT /api/athletes/:id", () => {
  let appA: FastifyInstance;
  let appB: FastifyInstance;

  beforeEach(async () => {
    appA = await buildApp(CLUB_A_USER);
    appB = await buildApp(CLUB_B_USER);
  });

  afterEach(async () => {
    await appA.close();
    await appB.close();
  });

  it("returns 404 when Club B tries to update Club A's athlete", async () => {
    const res = await appB.inject({
      method: "PUT",
      url: `/api/athletes/${ATHLETE_IN_A.id}`,
      payload: { name: "Hijacked" },
    });
    expect(res.statusCode).toBe(404);
  });
});
