import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCharges, generateCharges, ApiError } from "./charges";

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

const fakeChargesResult = {
  data: [
    {
      id: "chg_001",
      memberId: "mem_001",
      memberName: "João Silva",
      amountCents: 9900,
      dueDate: "2025-03-31T23:59:59.999Z",
      status: "PENDING",
      method: "PIX",
      gatewayName: "asaas",
      externalId: "ext_001",
      gatewayMeta: { qrCodeBase64: "abc123", pixCopyPaste: "00020126" },
      retryCount: 0,
      createdAt: "2025-03-01T00:00:00.000Z",
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

const fakeGenerateResult = {
  generated: 3,
  skipped: 1,
  errors: [],
  gatewayErrors: [],
  staticPixFallbackCount: 0,
};

describe("fetchCharges", () => {
  it("returns ChargesListResult on 200", async () => {
    mockFetch(200, fakeChargesResult);

    const result = await fetchCharges({}, FAKE_TOKEN);
    expect(result).toEqual(fakeChargesResult);
  });

  it("sends GET to /api/charges with Authorization header", async () => {
    mockFetch(200, fakeChargesResult);

    await fetchCharges({}, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/charges");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeChargesResult);

    await fetchCharges({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("appends month param to query string", async () => {
    mockFetch(200, fakeChargesResult);

    await fetchCharges({ month: "2025-03" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("month=2025-03");
  });

  it("appends status param to query string", async () => {
    mockFetch(200, fakeChargesResult);

    await fetchCharges({ status: "OVERDUE" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("status=OVERDUE");
  });

  it("appends page and limit to query string", async () => {
    mockFetch(200, fakeChargesResult);

    await fetchCharges({ page: 2, limit: 10 }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("page=2");
    expect(url).toContain("limit=10");
  });

  it("appends memberId to query string when provided", async () => {
    mockFetch(200, fakeChargesResult);

    await fetchCharges({ memberId: "mem_007" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("memberId=mem_007");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });

    await expect(fetchCharges({}, FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchCharges({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws ApiError on 403", async () => {
    mockFetch(403, {
      statusCode: 403,
      error: "Forbidden",
      message: "Acesso negado",
    });

    await expect(fetchCharges({}, FAKE_TOKEN)).rejects.toMatchObject({
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

    await expect(fetchCharges({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
      message: "Erro ao carregar cobranças: 500",
    });
  });

  it("preserves error message from JSON body", async () => {
    mockFetch(503, {
      message: "Database timeout",
      error: "Service Unavailable",
    });

    await expect(fetchCharges({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 503,
      message: "Database timeout",
    });
  });
});

describe("generateCharges", () => {
  it("returns GenerateChargesResult on 200", async () => {
    mockFetch(200, fakeGenerateResult);

    const result = await generateCharges({}, FAKE_TOKEN);
    expect(result).toEqual(fakeGenerateResult);
  });

  it("sends POST to /api/charges/generate", async () => {
    mockFetch(200, fakeGenerateResult);

    await generateCharges({}, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/charges/generate");
    expect(options.method).toBe("POST");
  });

  it("sends Content-Type: application/json header", async () => {
    mockFetch(200, fakeGenerateResult);

    await generateCharges({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("sends Authorization header with bearer token", async () => {
    mockFetch(200, fakeGenerateResult);

    await generateCharges({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends billingPeriod in body when provided", async () => {
    mockFetch(200, fakeGenerateResult);

    await generateCharges(
      { billingPeriod: "2025-03-01T00:00:00.000Z" },
      FAKE_TOKEN,
    );

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["billingPeriod"]).toBe("2025-03-01T00:00:00.000Z");
  });

  it("throws ApiError on 422 (no active plan)", async () => {
    mockFetch(422, {
      statusCode: 422,
      error: "Unprocessable Entity",
      message: "O clube não possui um plano ativo.",
    });

    await expect(generateCharges({}, FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(generateCharges({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 422,
      message: "O clube não possui um plano ativo.",
    });
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, { message: "Token inválido" });

    await expect(generateCharges({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws ApiError with fallback message on non-JSON error body", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(generateCharges({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 503,
      message: "Erro ao gerar cobranças: 503",
    });
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeGenerateResult);

    await generateCharges({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });
});
