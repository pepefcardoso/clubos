import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchDashboardSummary,
  fetchChargesHistory,
  ApiError,
} from "./dashboard";

const FAKE_TOKEN = "test-access-token";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body?: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

const fakeSummary = {
  members: { total: 120, active: 100, inactive: 10, overdue: 10 },
  charges: {
    pendingCount: 5,
    pendingAmountCents: 25000,
    overdueCount: 3,
    overdueAmountCents: 15000,
  },
  payments: { paidThisMonthCount: 80, paidThisMonthAmountCents: 400000 },
};

const fakeHistory = [
  {
    month: "2025-01",
    paid: 80,
    overdue: 5,
    pending: 10,
    paidAmountCents: 399500,
    overdueAmountCents: 25000,
  },
  {
    month: "2025-02",
    paid: 85,
    overdue: 3,
    pending: 8,
    paidAmountCents: 425000,
    overdueAmountCents: 15000,
  },
];

describe("fetchDashboardSummary", () => {
  it("returns DashboardSummary on 200", async () => {
    mockFetch(200, fakeSummary);

    const result = await fetchDashboardSummary(FAKE_TOKEN);
    expect(result).toEqual(fakeSummary);
  });

  it("sends GET to /api/dashboard/summary with Authorization header", async () => {
    mockFetch(200, fakeSummary);

    await fetchDashboardSummary(FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/dashboard/summary");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeSummary);

    await fetchDashboardSummary(FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });

    await expect(fetchDashboardSummary(FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchDashboardSummary(FAKE_TOKEN)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws ApiError with fallback message when body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(fetchDashboardSummary(FAKE_TOKEN)).rejects.toMatchObject({
      status: 503,
      message: "Erro ao carregar dashboard: 503",
    });
  });
});

describe("fetchChargesHistory", () => {
  it("returns MonthlyChargeStat array on 200", async () => {
    mockFetch(200, fakeHistory);

    const result = await fetchChargesHistory(FAKE_TOKEN);
    expect(result).toEqual(fakeHistory);
  });

  it("uses default of 6 months when no months param is given", async () => {
    mockFetch(200, fakeHistory);

    await fetchChargesHistory(FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("months=6");
  });

  it("passes custom months param in query string", async () => {
    mockFetch(200, fakeHistory);

    await fetchChargesHistory(FAKE_TOKEN, 12);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("months=12");
  });

  it("sends Authorization header with bearer token", async () => {
    mockFetch(200, fakeHistory);

    await fetchChargesHistory(FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("throws ApiError on 403", async () => {
    mockFetch(403, {
      statusCode: 403,
      error: "Forbidden",
      message: "Acesso negado",
    });

    await expect(fetchChargesHistory(FAKE_TOKEN)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws ApiError with fallback message on non-JSON error body", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(fetchChargesHistory(FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
      message: "Erro ao carregar histórico: 500",
    });
  });
});
