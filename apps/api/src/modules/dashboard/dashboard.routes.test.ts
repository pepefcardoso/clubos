/**
 * Route-level tests for GET /api/dashboard/summary and
 * GET /api/dashboard/charges-history.
 *
 * Uses Fastify's inject() to exercise routing and query-param handling
 * without a real database. The service layer is fully mocked.
 *
 * Authentication is not exercised here — these routes live inside
 * protectedRoutes in production, but the test registers them directly
 * and injects a synthetic request.user so the handler can read clubId.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { dashboardRoutes } from "./dashboard.routes.js";
import type { AccessTokenPayload } from "../../types/fastify.js";

vi.mock("./dashboard.service.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./dashboard.service.js")>();
  return {
    ...original,
    getDashboardSummary: vi.fn(),
    getChargesHistory: vi.fn(),
  };
});

import { getDashboardSummary, getChargesHistory } from "./dashboard.service.js";

const TEST_CLUB_ID = "club_test_123";
const TEST_USER: AccessTokenPayload = {
  sub: "user_test_abc",
  clubId: TEST_CLUB_ID,
  role: "ADMIN",
  type: "access",
};

const MOCK_SUMMARY = {
  members: { total: 55, active: 42, inactive: 5, overdue: 8 },
  charges: {
    pendingCount: 30,
    pendingAmountCents: 150000,
    overdueCount: 8,
    overdueAmountCents: 40000,
  },
  payments: { paidThisMonthCount: 35, paidThisMonthAmountCents: 175000 },
};

const MOCK_HISTORY = [
  {
    month: "2025-01",
    paid: 10,
    overdue: 2,
    pending: 3,
    paidAmountCents: 50000,
    overdueAmountCents: 10000,
  },
  {
    month: "2025-02",
    paid: 15,
    overdue: 1,
    pending: 2,
    paidAmountCents: 75000,
    overdueAmountCents: 5000,
  },
];

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate(
    "prisma",
    {} as unknown as import("../../../generated/prisma/index.js").PrismaClient,
  );

  app.addHook("preHandler", async (request) => {
    (request as unknown as { user: AccessTokenPayload }).user = TEST_USER;
  });

  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  return app;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(getDashboardSummary).mockReset();
  vi.mocked(getChargesHistory).mockReset();
});

describe("GET /api/dashboard/summary", () => {
  it("returns 200 with the full summary body", async () => {
    vi.mocked(getDashboardSummary).mockResolvedValue(MOCK_SUMMARY);

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/summary",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.members.total).toBe(55);
    expect(body.members.active).toBe(42);
    expect(body.charges.pendingCount).toBe(30);
    expect(body.charges.overdueAmountCents).toBe(40000);
    expect(body.payments.paidThisMonthCount).toBe(35);
    expect(body.payments.paidThisMonthAmountCents).toBe(175000);
  });

  it("calls getDashboardSummary with the authenticated user's clubId", async () => {
    vi.mocked(getDashboardSummary).mockResolvedValue(MOCK_SUMMARY);

    await app.inject({ method: "GET", url: "/api/dashboard/summary" });

    expect(getDashboardSummary).toHaveBeenCalledOnce();
    expect(getDashboardSummary).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
    );
  });

  it("propagates unhandled service errors as 500", async () => {
    vi.mocked(getDashboardSummary).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/summary",
    });

    expect(res.statusCode).toBe(500);
  });
});

describe("GET /api/dashboard/charges-history", () => {
  it("returns 200 with an array of monthly stats", async () => {
    vi.mocked(getChargesHistory).mockResolvedValue(MOCK_HISTORY);

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].month).toBe("2025-01");
  });

  it("defaults to 6 months when the query param is absent", async () => {
    vi.mocked(getChargesHistory).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history",
    });

    expect(getChargesHistory).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      6,
    );
  });

  it("passes the months query param to the service", async () => {
    vi.mocked(getChargesHistory).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history?months=3",
    });

    expect(getChargesHistory).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      3,
    );
  });

  it("clamps months to a maximum of 12", async () => {
    vi.mocked(getChargesHistory).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history?months=99",
    });

    expect(getChargesHistory).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      12,
    );
  });

  it("clamps months to a minimum of 1", async () => {
    vi.mocked(getChargesHistory).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history?months=0",
    });

    expect(getChargesHistory).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      1,
    );
  });

  it("treats a non-numeric months param as the default 6", async () => {
    vi.mocked(getChargesHistory).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history?months=abc",
    });

    expect(getChargesHistory).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      6,
    );
  });

  it("calls getChargesHistory with the authenticated user's clubId", async () => {
    vi.mocked(getChargesHistory).mockResolvedValue([]);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history",
    });

    expect(getChargesHistory).toHaveBeenCalledOnce();
    expect(getChargesHistory).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      expect.any(Number),
    );
  });

  it("propagates unhandled service errors as 500", async () => {
    vi.mocked(getChargesHistory).mockRejectedValue(new Error("Timeout"));

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/charges-history",
    });

    expect(res.statusCode).toBe(500);
  });
});
