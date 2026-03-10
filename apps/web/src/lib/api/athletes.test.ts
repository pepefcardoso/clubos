import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAthletes,
  createAthlete,
  updateAthlete,
  getAthlete,
  ApiError,
} from "./athletes";

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

const fakeAthlete = {
  id: "ath_1",
  name: "Carlos Eduardo",
  cpf: "12345678900",
  birthDate: "1998-06-15",
  position: "Atacante",
  status: "ACTIVE" as const,
  createdAt: "2025-01-01T00:00:00.000Z",
};

const fakePaginatedResponse = {
  data: [fakeAthlete],
  total: 1,
  page: 1,
  limit: 20,
};

describe("fetchAthletes", () => {
  it("returns PaginatedResponse on 200", async () => {
    mockFetch(200, fakePaginatedResponse);

    const result = await fetchAthletes({}, FAKE_TOKEN);
    expect(result).toEqual(fakePaginatedResponse);
  });

  it("sends Authorization header", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchAthletes({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchAthletes({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("appends page and limit as query params", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchAthletes({ page: 2, limit: 10 }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("page=2");
    expect(url).toContain("limit=10");
  });

  it("appends search query param when provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchAthletes({ search: "Carlos" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("search=Carlos");
  });

  it("omits search query param when empty string", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchAthletes({ search: "   " }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("search");
  });

  it("appends status query param when provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchAthletes({ status: "SUSPENDED" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("status=SUSPENDED");
  });

  it("omits status query param when not provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchAthletes({}, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("status=");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });

    await expect(fetchAthletes({}, FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchAthletes({}, FAKE_TOKEN)).rejects.toMatchObject({
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

    await expect(fetchAthletes({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("createAthlete", () => {
  it("returns AthleteResponse on 201", async () => {
    mockFetch(201, fakeAthlete);

    const result = await createAthlete(
      {
        name: "Carlos Eduardo",
        cpf: "12345678900",
        birthDate: "1998-06-15",
        position: "Atacante",
      },
      FAKE_TOKEN,
    );

    expect(result).toEqual(fakeAthlete);
  });

  it("sends POST with correct body", async () => {
    mockFetch(201, fakeAthlete);

    const payload = {
      name: "Carlos Eduardo",
      cpf: "12345678900",
      birthDate: "1998-06-15",
    };

    await createAthlete(payload, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/athletes");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual(payload);
  });

  it("sends Authorization header and credentials", async () => {
    mockFetch(201, fakeAthlete);

    await createAthlete(
      { name: "Carlos", cpf: "12345678900", birthDate: "1998-06-15" },
      FAKE_TOKEN,
    );

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
    expect(options.credentials).toBe("include");
  });

  it("sends Content-Type application/json header", async () => {
    mockFetch(201, fakeAthlete);

    await createAthlete(
      { name: "Carlos", cpf: "12345678900", birthDate: "1998-06-15" },
      FAKE_TOKEN,
    );

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("omits position when not provided", async () => {
    mockFetch(201, { ...fakeAthlete, position: null });

    const payload = {
      name: "Carlos",
      cpf: "12345678900",
      birthDate: "1998-06-15",
    };

    await createAthlete(payload, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.position).toBeUndefined();
  });

  it("throws ApiError with status 409 on duplicate CPF", async () => {
    mockFetch(409, {
      statusCode: 409,
      error: "Conflict",
      message: "Atleta com este CPF já está cadastrado",
    });

    await expect(
      createAthlete(
        { name: "Carlos", cpf: "12345678900", birthDate: "1998-06-15" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Atleta com este CPF já está cadastrado",
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
      createAthlete(
        { name: "Carlos", cpf: "12345678900", birthDate: "1998-06-15" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao cadastrar atleta",
    });
  });
});

describe("updateAthlete", () => {
  it("returns updated AthleteResponse on 200", async () => {
    const updated = { ...fakeAthlete, name: "Carlos Atualizado" };
    mockFetch(200, updated);

    const result = await updateAthlete(
      "ath_1",
      { name: "Carlos Atualizado" },
      FAKE_TOKEN,
    );

    expect(result).toEqual(updated);
  });

  it("sends PUT to the correct URL with payload", async () => {
    mockFetch(200, fakeAthlete);

    await updateAthlete("ath_1", { position: "Meia" }, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/athletes/ath_1");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ position: "Meia" });
  });

  it("allows setting position to null (clear position)", async () => {
    mockFetch(200, { ...fakeAthlete, position: null });

    await updateAthlete("ath_1", { position: null }, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ position: null });
  });

  it("allows updating status to SUSPENDED", async () => {
    mockFetch(200, { ...fakeAthlete, status: "SUSPENDED" });

    await updateAthlete("ath_1", { status: "SUSPENDED" }, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      status: "SUSPENDED",
    });
  });

  it("allows updating birthDate", async () => {
    mockFetch(200, { ...fakeAthlete, birthDate: "2000-01-01" });

    await updateAthlete("ath_1", { birthDate: "2000-01-01" }, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      birthDate: "2000-01-01",
    });
  });

  it("throws ApiError on 404 when athlete is not found", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });

    await expect(
      updateAthlete("nonexistent", { name: "X" }, FAKE_TOKEN),
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
      updateAthlete("ath_1", { name: "X" }, FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao atualizar atleta",
    });
  });
});

describe("getAthlete", () => {
  it("returns AthleteResponse on 200", async () => {
    mockFetch(200, fakeAthlete);

    const result = await getAthlete("ath_1", FAKE_TOKEN);
    expect(result).toEqual(fakeAthlete);
  });

  it("sends GET to /api/athletes/:id with Authorization header", async () => {
    mockFetch(200, fakeAthlete);

    await getAthlete("ath_1", FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/athletes/ath_1");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeAthlete);

    await getAthlete("ath_1", FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("throws ApiError with status 404 when athlete does not exist", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Atleta não encontrado",
    });

    await expect(getAthlete("nonexistent", FAKE_TOKEN)).rejects.toMatchObject({
      status: 404,
      message: "Atleta não encontrado",
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

    await expect(getAthlete("ath_1", FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
      message: "Atleta não encontrado",
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
