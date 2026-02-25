import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchPlans,
  createPlan,
  updatePlan,
  deletePlan,
  ApiError,
} from "./plans";

const FAKE_TOKEN = "test-access-token";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(status: number, body?: unknown) {
  const mockedFetch = vi.mocked(fetch);
  mockedFetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("fetchPlans", () => {
  it("returns plan array on 200", async () => {
    const fakePlans = [
      {
        id: "plan_1",
        name: "Sócio Ouro",
        priceCents: 4990,
        interval: "monthly",
        benefits: [],
        isActive: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
    ];
    mockFetch(200, fakePlans);

    const result = await fetchPlans(FAKE_TOKEN);
    expect(result).toEqual(fakePlans);
  });

  it("includes activeOnly query param when requested", async () => {
    mockFetch(200, []);
    await fetchPlans(FAKE_TOKEN, true);

    const mockedFetch = vi.mocked(fetch);
    const calledUrl = mockedFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("?activeOnly=true");
  });

  it("does not include activeOnly when false", async () => {
    mockFetch(200, []);
    await fetchPlans(FAKE_TOKEN, false);

    const mockedFetch = vi.mocked(fetch);
    const calledUrl = mockedFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).not.toContain("activeOnly");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });

    await expect(fetchPlans(FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchPlans(FAKE_TOKEN)).rejects.toMatchObject({ status: 401 });
  });

  it("throws ApiError on 500 with fallback message", async () => {
    const mockedFetch = vi.mocked(fetch);
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    await expect(fetchPlans(FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
      message: "Erro inesperado",
    });
  });
});

describe("createPlan", () => {
  it("sends POST with correct body and returns created plan", async () => {
    const payload = {
      name: "Sócio Bronze",
      priceCents: 1990,
      interval: "monthly" as const,
      benefits: ["Entrada no estádio"],
    };
    const fakePlan = {
      ...payload,
      id: "plan_new",
      isActive: true,
      createdAt: "",
      updatedAt: "",
    };
    mockFetch(201, fakePlan);

    const result = await createPlan(payload, FAKE_TOKEN);

    const mockedFetch = vi.mocked(fetch);
    const [, options] = mockedFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual(payload);
    expect(result).toEqual(fakePlan);
  });

  it("throws ApiError with status 409 on duplicate name", async () => {
    mockFetch(409, {
      statusCode: 409,
      error: "Conflict",
      message: "Já existe um plano com este nome",
    });

    await expect(
      createPlan(
        { name: "Dup", priceCents: 100, interval: "monthly", benefits: [] },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Já existe um plano com este nome",
    });
  });
});

describe("updatePlan", () => {
  it("sends PUT to the correct URL", async () => {
    const updated = {
      id: "plan_1",
      name: "Novo Nome",
      priceCents: 2990,
      interval: "monthly" as const,
      benefits: [],
      isActive: true,
      createdAt: "",
      updatedAt: "",
    };
    mockFetch(200, updated);

    await updatePlan("plan_1", { name: "Novo Nome" }, FAKE_TOKEN);

    const mockedFetch = vi.mocked(fetch);
    const [url, options] = mockedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/plans/plan_1");
    expect(options.method).toBe("PUT");
  });
});

describe("deletePlan", () => {
  it("sends DELETE and resolves void on 204", async () => {
    mockFetch(204);

    await expect(deletePlan("plan_1", FAKE_TOKEN)).resolves.toBeUndefined();

    const mockedFetch = vi.mocked(fetch);
    const [url, options] = mockedFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/plans/plan_1");
    expect(options.method).toBe("DELETE");
  });

  it("throws ApiError 409 when plan has active members", async () => {
    mockFetch(409, {
      statusCode: 409,
      error: "Conflict",
      message: "Não é possível excluir um plano com sócios ativos vinculados",
    });

    await expect(deletePlan("plan_1", FAKE_TOKEN)).rejects.toMatchObject({
      status: 409,
    });
  });
});
