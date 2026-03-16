import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchContracts,
  createContract,
  updateContract,
  getContract,
  ApiError,
} from "./contracts";

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

const fakeContract = {
  id: "con_1",
  athleteId: "ath_1",
  type: "PROFESSIONAL" as const,
  status: "ACTIVE" as const,
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  bidRegistered: false,
  federationCode: null,
  notes: null,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const fakePaginatedResponse = {
  data: [fakeContract],
  total: 1,
  page: 1,
  limit: 20,
};

describe("fetchContracts", () => {
  it("returns PaginatedResponse on 200", async () => {
    mockFetch(200, fakePaginatedResponse);

    const result = await fetchContracts({}, FAKE_TOKEN);
    expect(result).toEqual(fakePaginatedResponse);
  });

  it("sends Authorization header", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchContracts({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchContracts({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("appends page and limit as query params", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchContracts({ page: 2, limit: 10 }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("page=2");
    expect(url).toContain("limit=10");
  });

  it("appends athleteId query param when provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchContracts({ athleteId: "ath_1" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("athleteId=ath_1");
  });

  it("appends status query param when provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchContracts({ status: "ACTIVE" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("status=ACTIVE");
  });

  it("omits status query param when not provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchContracts({}, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("status=");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });

    await expect(fetchContracts({}, FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchContracts({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws ApiError with fallback message when body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(fetchContracts({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("createContract", () => {
  it("returns ContractResponse on 201", async () => {
    mockFetch(201, fakeContract);

    const result = await createContract(
      { athleteId: "ath_1", type: "PROFESSIONAL", startDate: "2025-01-01" },
      FAKE_TOKEN,
    );

    expect(result).toEqual(fakeContract);
  });

  it("sends POST with correct body", async () => {
    mockFetch(201, fakeContract);

    const payload = {
      athleteId: "ath_1",
      type: "PROFESSIONAL" as const,
      startDate: "2025-01-01",
    };
    await createContract(payload, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/contracts");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual(payload);
  });

  it("sends Content-Type application/json header", async () => {
    mockFetch(201, fakeContract);

    await createContract(
      { athleteId: "ath_1", type: "PROFESSIONAL", startDate: "2025-01-01" },
      FAKE_TOKEN,
    );

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("throws ApiError with status 409 on active contract conflict", async () => {
    mockFetch(409, {
      statusCode: 409,
      error: "Conflict",
      message: "Atleta já possui um contrato ATIVO.",
    });

    await expect(
      createContract(
        { athleteId: "ath_1", type: "PROFESSIONAL", startDate: "2025-01-01" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Atleta já possui um contrato ATIVO.",
    });
  });

  it("throws ApiError with fallback message on non-JSON error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(
      createContract(
        { athleteId: "ath_1", type: "PROFESSIONAL", startDate: "2025-01-01" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao cadastrar contrato",
    });
  });
});

describe("updateContract", () => {
  it("returns updated ContractResponse on 200", async () => {
    const updated = { ...fakeContract, bidRegistered: true };
    mockFetch(200, updated);

    const result = await updateContract(
      "con_1",
      { bidRegistered: true },
      FAKE_TOKEN,
    );
    expect(result).toEqual(updated);
  });

  it("sends PUT to correct URL with payload", async () => {
    mockFetch(200, fakeContract);

    await updateContract("con_1", { status: "EXPIRED" }, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/contracts/con_1");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ status: "EXPIRED" });
  });

  it("allows setting endDate to null", async () => {
    mockFetch(200, { ...fakeContract, endDate: null });

    await updateContract("con_1", { endDate: null }, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ endDate: null });
  });

  it("throws ApiError with status 422 on terminated contract", async () => {
    mockFetch(422, {
      statusCode: 422,
      error: "Unprocessable Entity",
      message: "Contrato já está TERMINATED e não pode ser alterado.",
    });

    await expect(
      updateContract("con_1", { status: "ACTIVE" }, FAKE_TOKEN),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("throws ApiError on 404 when contract is not found", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Contrato não encontrado",
    });

    await expect(
      updateContract("nonexistent", { bidRegistered: true }, FAKE_TOKEN),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws ApiError with fallback message on non-JSON error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(
      updateContract("con_1", { status: "EXPIRED" }, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao atualizar contrato",
    });
  });
});

describe("getContract", () => {
  it("returns ContractResponse on 200", async () => {
    mockFetch(200, fakeContract);

    const result = await getContract("con_1", FAKE_TOKEN);
    expect(result).toEqual(fakeContract);
  });

  it("sends GET to /api/contracts/:id with Authorization header", async () => {
    mockFetch(200, fakeContract);

    await getContract("con_1", FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/contracts/con_1");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeContract);

    await getContract("con_1", FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("throws ApiError with status 404 when contract does not exist", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Contrato não encontrado",
    });

    await expect(getContract("nonexistent", FAKE_TOKEN)).rejects.toMatchObject({
      status: 404,
      message: "Contrato não encontrado",
    });
  });
});

describe("ApiError", () => {
  it("is an instance of Error", () => {
    const err = new ApiError("msg", 422);
    expect(err).toBeInstanceOf(Error);
  });

  it("exposes status and optional error property", () => {
    const err = new ApiError("msg", 409, "Conflict");
    expect(err.status).toBe(409);
    expect(err.error).toBe("Conflict");
    expect(err.message).toBe("msg");
    expect(err.name).toBe("ApiError");
  });
});
