import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchDashboardSummary,
  fetchChargesHistory,
  fetchOverdueMembers,
  remindMember,
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

const fakeOverdueResult = {
  data: [
    {
      memberId: "mem_001",
      memberName: "João Silva",
      chargeId: "chg_001",
      amountCents: 9900,
      dueDate: "2025-01-10T00:00:00.000Z",
      daysPastDue: 55,
    },
  ],
  total: 5,
  page: 1,
  limit: 20,
};

const fakeRemindResult = {
  messageId: "msg_abc_123",
  status: "SENT" as const,
};

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

describe("fetchOverdueMembers", () => {
  it("returns OverdueMembersResult on 200", async () => {
    mockFetch(200, fakeOverdueResult);

    const result = await fetchOverdueMembers(FAKE_TOKEN);
    expect(result).toEqual(fakeOverdueResult);
  });

  it("sends GET to /api/dashboard/overdue-members", async () => {
    mockFetch(200, fakeOverdueResult);

    await fetchOverdueMembers(FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/dashboard/overdue-members");
  });

  it("includes default page=1 and limit=20 in query string", async () => {
    mockFetch(200, fakeOverdueResult);

    await fetchOverdueMembers(FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("page=1");
    expect(url).toContain("limit=20");
  });

  it("passes custom page and limit in query string", async () => {
    mockFetch(200, fakeOverdueResult);

    await fetchOverdueMembers(FAKE_TOKEN, 3, 10);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("page=3");
    expect(url).toContain("limit=10");
  });

  it("sends Authorization header with bearer token", async () => {
    mockFetch(200, fakeOverdueResult);

    await fetchOverdueMembers(FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeOverdueResult);

    await fetchOverdueMembers(FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });

    await expect(fetchOverdueMembers(FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchOverdueMembers(FAKE_TOKEN)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws ApiError on 403", async () => {
    mockFetch(403, {
      statusCode: 403,
      error: "Forbidden",
      message: "Acesso negado",
    });

    await expect(fetchOverdueMembers(FAKE_TOKEN)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws ApiError with fallback message on non-JSON error body", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(fetchOverdueMembers(FAKE_TOKEN)).rejects.toMatchObject({
      status: 502,
      message: "Erro ao carregar inadimplentes: 502",
    });
  });

  it("preserves the error message from the JSON body", async () => {
    mockFetch(500, {
      statusCode: 500,
      error: "Internal Server Error",
      message: "Database timeout",
    });

    await expect(fetchOverdueMembers(FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
      message: "Database timeout",
    });
  });
});

describe("remindMember", () => {
  it("returns RemindMemberResult on 200", async () => {
    mockFetch(200, fakeRemindResult);

    const result = await remindMember(FAKE_TOKEN, "mem_001");
    expect(result).toEqual(fakeRemindResult);
  });

  it("sends POST to /api/members/:memberId/remind", async () => {
    mockFetch(200, fakeRemindResult);

    await remindMember(FAKE_TOKEN, "mem_001");

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/members/mem_001/remind");
    expect(options.method).toBe("POST");
  });

  it("sends Authorization header with bearer token", async () => {
    mockFetch(200, fakeRemindResult);

    await remindMember(FAKE_TOKEN, "mem_001");

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeRemindResult);

    await remindMember(FAKE_TOKEN, "mem_001");

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("correctly encodes the memberId in the URL path", async () => {
    mockFetch(200, fakeRemindResult);

    await remindMember(FAKE_TOKEN, "cjld2cjxh0000qzrmn831i7rn");

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/members/cjld2cjxh0000qzrmn831i7rn/remind");
  });

  it("throws ApiError on 404 (member not found or no OVERDUE charges)", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Sócio não encontrado ou sem cobranças em atraso.",
    });

    await expect(remindMember(FAKE_TOKEN, "mem_none")).rejects.toThrow(
      ApiError,
    );
    await expect(remindMember(FAKE_TOKEN, "mem_none")).rejects.toMatchObject({
      status: 404,
      message: "Sócio não encontrado ou sem cobranças em atraso.",
    });
  });

  it("throws ApiError on 429 (rate limited or already sent)", async () => {
    mockFetch(429, {
      statusCode: 429,
      error: "Too Many Requests",
      message:
        "Uma mensagem já foi enviada para este sócio nas últimas 4 horas.",
    });

    await expect(remindMember(FAKE_TOKEN, "mem_001")).rejects.toMatchObject({
      status: 429,
      message:
        "Uma mensagem já foi enviada para este sócio nas últimas 4 horas.",
    });
  });

  it("throws ApiError on 502 (WhatsApp provider failure)", async () => {
    mockFetch(502, {
      statusCode: 502,
      error: "Bad Gateway",
      message: "Falha no envio da mensagem",
    });

    await expect(remindMember(FAKE_TOKEN, "mem_001")).rejects.toMatchObject({
      status: 502,
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

    await expect(remindMember(FAKE_TOKEN, "mem_001")).rejects.toMatchObject({
      status: 500,
      message: "Erro ao enviar lembrete",
    });
  });
});
