/**
 * Route-level tests for:
 *   GET /api/dashboard/summary
 *   GET /api/dashboard/charges-history
 *   GET /api/dashboard/overdue-members
 *
 * Uses Fastify's inject() to exercise routing and query-param handling
 * without a real database. The service layer is fully mocked.
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
    getOverdueMembers: vi.fn(),
  };
});

import {
  getDashboardSummary,
  getChargesHistory,
  getOverdueMembers,
} from "./dashboard.service.js";

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

const MOCK_OVERDUE_RESULT = {
  data: [
    {
      memberId: "mem_001",
      memberName: "João Silva",
      chargeId: "chg_001",
      amountCents: 9900,
      dueDate: new Date("2025-01-15"),
      daysPastDue: 45,
    },
    {
      memberId: "mem_002",
      memberName: "Maria Santos",
      chargeId: "chg_002",
      amountCents: 14900,
      dueDate: new Date("2025-01-20"),
      daysPastDue: 40,
    },
  ],
  total: 8,
  page: 1,
  limit: 20,
};

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
  vi.mocked(getOverdueMembers).mockReset();
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

describe("GET /api/dashboard/overdue-members", () => {
  it("returns 200 with paginated overdue members", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue(MOCK_OVERDUE_RESULT);

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(8);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it("defaults to page=1 and limit=20 when query params are absent", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue(MOCK_OVERDUE_RESULT);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members",
    });

    expect(getOverdueMembers).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      1,
      20,
    );
  });

  it("passes page and limit query params to the service", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue({
      ...MOCK_OVERDUE_RESULT,
      page: 2,
      limit: 10,
    });

    await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members?page=2&limit=10",
    });

    expect(getOverdueMembers).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      2,
      10,
    );
  });

  it("clamps limit to a maximum of 50", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue(MOCK_OVERDUE_RESULT);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members?limit=200",
    });

    expect(getOverdueMembers).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      expect.any(Number),
      50,
    );
  });

  it("clamps page to a minimum of 1", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue(MOCK_OVERDUE_RESULT);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members?page=0",
    });

    expect(getOverdueMembers).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      1,
      expect.any(Number),
    );
  });

  it("treats non-numeric page as default 1", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue(MOCK_OVERDUE_RESULT);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members?page=abc",
    });

    expect(getOverdueMembers).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      1,
      expect.any(Number),
    );
  });

  it("calls getOverdueMembers with the authenticated user's clubId", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue(MOCK_OVERDUE_RESULT);

    await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members",
    });

    expect(getOverdueMembers).toHaveBeenCalledOnce();
    expect(getOverdueMembers).toHaveBeenCalledWith(
      expect.anything(),
      TEST_CLUB_ID,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("returns empty data array when no overdue members exist", async () => {
    vi.mocked(getOverdueMembers).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it("propagates unhandled service errors as 500", async () => {
    vi.mocked(getOverdueMembers).mockRejectedValue(
      new Error("Raw query failed"),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/dashboard/overdue-members",
    });

    expect(res.statusCode).toBe(500);
  });
});
