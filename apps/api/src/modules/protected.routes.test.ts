import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { AccessTokenPayload } from "../types/fastify.js";

vi.mock("./members/members.routes.js", () => ({
  memberRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "members" }));
    fastify.get("/whoami", async (request: FastifyRequest) => ({
      actorId: request.actorId,
    }));
  },
}));

vi.mock("./plans/plans.routes.js", () => ({
  planRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "plans" }));
  },
}));

vi.mock("./charges/charges.routes.js", () => ({
  chargeRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "charges" }));
  },
}));

vi.mock("./templates/templates.routes.js", () => ({
  templateRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "templates" }));
  },
}));

vi.mock("./messages/messages.routes.js", () => ({
  messageRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "messages" }));
  },
}));

vi.mock("./dashboard/dashboard.routes.js", () => ({
  dashboardRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "dashboard" }));
  },
}));

vi.mock("./athletes/athletes.routes.js", () => ({
  athleteRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "athletes" }));
  },
}));

vi.mock("./contracts/contracts.routes.js", () => ({
  contractRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "contracts" }));
  },
}));

vi.mock("./rtp/rtp.routes.js", () => ({
  rtpRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/:athleteId/rtp", async () => ({ resource: "rtp" }));
  },
}));

vi.mock("./rules/rules-config.routes.js", () => ({
  rulesConfigRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "rules-config" }));
  },
}));

vi.mock("./workload/workload.routes.js", () => ({
  workloadRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "workload" }));
  },
}));

vi.mock("./expenses/expenses.routes.js", () => ({
  expenseRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "expenses" }));
  },
}));

vi.mock("./reconciliation/reconciliation.routes.js", () => ({
  reconciliationRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "reconciliation" }));
  },
}));

vi.mock("./balance-sheets/balance-sheets.routes.js", () => ({
  balanceSheetAdminRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "balance-sheets" }));
  },
}));

vi.mock("./exercises/exercises.routes.js", () => ({
  exerciseRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "exercises" }));
  },
}));

vi.mock("./training-sessions/training-sessions.routes.js", () => ({
  trainingSessionRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "training-sessions" }));
  },
}));

vi.mock("./integrations/integrations.routes.js", () => ({
  integrationRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "integrations" }));
  },
}));

vi.mock("./evaluations/evaluations.routes.js", () => ({
  evaluationRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "evaluations" }));
  },
}));

vi.mock("./medical-records/medical-records.routes.js", () => ({
  medicalRecordRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "medical-records" }));
  },
}));

vi.mock("./injury-protocols/injury-protocols.routes.js", () => ({
  injuryProtocolRoutes: async (fastify: FastifyInstance) => {
    fastify.get("/", async () => ({ resource: "injury-protocols" }));
  },
}));

import { protectedRoutes } from "./protected.routes.js";

const ADMIN_USER: AccessTokenPayload = {
  sub: "user-admin",
  clubId: "club-1",
  role: "ADMIN",
  type: "access",
};

const TREASURER_USER: AccessTokenPayload = {
  sub: "user-treasurer",
  clubId: "club-1",
  role: "TREASURER",
  type: "access",
};

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  fastify.decorate(
    "verifyAccessToken",
    async (request: FastifyRequest, reply: import("fastify").FastifyReply) => {
      const auth = request.headers.authorization;
      if (!auth) {
        return reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Missing or invalid access token.",
        });
      }
      const role = request.headers["x-test-role"];
      request.user = role === "TREASURER" ? TREASURER_USER : ADMIN_USER;
    },
  );

  fastify.decorate(
    "requireRole",
    (..._allowedRoles: Array<"ADMIN" | "TREASURER" | "PHYSIO">) =>
      async () => {
        // no-op in tests
      },
  );

  await fastify.register(protectedRoutes, { prefix: "/api" });
  await fastify.ready();
  return fastify;
}

describe("protectedRoutes — authentication guard", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects requests without an Authorization header with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/members" });
    expect(res.statusCode).toBe(401);
  });

  it("401 response body has the standard shape", async () => {
    const res = await app.inject({ method: "GET", url: "/api/members" });
    expect(res.json()).toMatchObject({
      statusCode: 401,
      error: "Unauthorized",
    });
  });

  it("allows requests that carry an Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members",
      headers: { authorization: "Bearer dummy" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("guard applies to every registered sub-resource, not just /members", async () => {
    const prefixes = [
      "/api/plans",
      "/api/charges",
      "/api/templates",
      "/api/messages",
      "/api/dashboard",
    ];

    for (const url of prefixes) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("protectedRoutes — actorId population", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("sets request.actorId to the sub from the access token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/whoami",
      headers: { authorization: "Bearer dummy" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().actorId).toBe(ADMIN_USER.sub);
  });

  it("actorId reflects the authenticated user's sub regardless of role", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/whoami",
      headers: {
        authorization: "Bearer dummy",
        "x-test-role": "TREASURER",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().actorId).toBe(TREASURER_USER.sub);
  });
});

describe("protectedRoutes — sub-resource mounting", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const subResources: Array<{ prefix: string; resource: string }> = [
    { prefix: "/api/members", resource: "members" },
    { prefix: "/api/plans", resource: "plans" },
    { prefix: "/api/charges", resource: "charges" },
    { prefix: "/api/templates", resource: "templates" },
    { prefix: "/api/messages", resource: "messages" },
    { prefix: "/api/dashboard", resource: "dashboard" },
  ];

  for (const { prefix, resource } of subResources) {
    it(`mounts ${resource} routes under ${prefix}`, async () => {
      const res = await app.inject({
        method: "GET",
        url: prefix,
        headers: { authorization: "Bearer dummy" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().resource).toBe(resource);
    });
  }

  it("routes outside /api are not registered by this plugin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/members",
      headers: { authorization: "Bearer dummy" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("protectedRoutes — verifyAccessToken is called once per request", () => {
  let app: FastifyInstance;
  const callCount = { value: 0 };

  beforeEach(async () => {
    callCount.value = 0;

    const fastify = Fastify({ logger: false });

    fastify.decorate(
      "verifyAccessToken",
      async (
        request: FastifyRequest,
        reply: import("fastify").FastifyReply,
      ) => {
        const auth = request.headers.authorization;
        if (!auth) {
          return reply.status(401).send({
            statusCode: 401,
            error: "Unauthorized",
            message: "Missing or invalid access token.",
          });
        }
        callCount.value += 1;
        request.user = ADMIN_USER;
      },
    );

    await fastify.register(protectedRoutes, { prefix: "/api" });
    await fastify.ready();
    app = fastify;
  });

  afterEach(async () => {
    await app.close();
  });

  it("invokes verifyAccessToken exactly once per request", async () => {
    await app.inject({
      method: "GET",
      url: "/api/members",
      headers: { authorization: "Bearer dummy" },
    });
    expect(callCount.value).toBe(1);
  });

  it("does not invoke verifyAccessToken when the request is rejected at the auth step", async () => {
    await app.inject({ method: "GET", url: "/api/members" });
    expect(callCount.value).toBe(0);
  });
});
