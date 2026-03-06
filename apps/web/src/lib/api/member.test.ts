import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchMembers,
  createMember,
  updateMember,
  getMember,
  ApiError,
} from "./members";

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

const fakeMember = {
  id: "mem_1",
  name: "João Silva",
  cpf: "123.456.789-00",
  phone: "48999999999",
  email: "joao@email.com",
  status: "ACTIVE" as const,
  planId: "plan_1",
  joinedAt: "2025-01-01T00:00:00.000Z",
};

const fakePaginatedResponse = {
  data: [fakeMember],
  total: 1,
  page: 1,
  limit: 20,
};

describe("fetchMembers", () => {
  it("returns PaginatedResponse on 200", async () => {
    mockFetch(200, fakePaginatedResponse);

    const result = await fetchMembers({}, FAKE_TOKEN);
    expect(result).toEqual(fakePaginatedResponse);
  });

  it("sends Authorization header", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchMembers({}, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("appends page and limit as query params", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchMembers({ page: 2, limit: 10 }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("page=2");
    expect(url).toContain("limit=10");
  });

  it("appends search query param when provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchMembers({ search: "João" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("search=Jo%C3%A3o");
  });

  it("omits search query param when empty string", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchMembers({ search: "   " }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("search");
  });

  it("appends status query param when provided", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchMembers({ status: "ACTIVE" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("status=ACTIVE");
  });

  it("omits status query param when empty string", async () => {
    mockFetch(200, fakePaginatedResponse);

    await fetchMembers({ status: "" }, FAKE_TOKEN);

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("status=");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });

    await expect(fetchMembers({}, FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchMembers({}, FAKE_TOKEN)).rejects.toMatchObject({
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

    await expect(fetchMembers({}, FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("createMember", () => {
  it("returns MemberResponse on 201", async () => {
    mockFetch(201, fakeMember);

    const result = await createMember(
      {
        name: "João Silva",
        cpf: "123.456.789-00",
        phone: "48999999999",
        email: "joao@email.com",
        planId: "plan_1",
      },
      FAKE_TOKEN,
    );

    expect(result).toEqual(fakeMember);
  });

  it("sends POST with correct body", async () => {
    mockFetch(201, fakeMember);

    const payload = {
      name: "João Silva",
      cpf: "123.456.789-00",
      phone: "48999999999",
    };

    await createMember(payload, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/members");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual(payload);
  });

  it("sends Authorization header and credentials", async () => {
    mockFetch(201, fakeMember);

    await createMember(
      { name: "João", cpf: "111.111.111-11", phone: "48900000000" },
      FAKE_TOKEN,
    );

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
    expect(options.credentials).toBe("include");
  });

  it("throws ApiError with status 409 on duplicate CPF", async () => {
    mockFetch(409, {
      statusCode: 409,
      error: "Conflict",
      message: "CPF já cadastrado",
    });

    await expect(
      createMember(
        { name: "João", cpf: "123.456.789-00", phone: "48999999999" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "CPF já cadastrado",
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
      createMember(
        { name: "João", cpf: "111.111.111-11", phone: "48900000000" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao cadastrar sócio",
    });
  });
});

describe("updateMember", () => {
  it("returns updated MemberResponse on 200", async () => {
    const updated = { ...fakeMember, name: "João Atualizado" };
    mockFetch(200, updated);

    const result = await updateMember(
      "mem_1",
      { name: "João Atualizado" },
      FAKE_TOKEN,
    );

    expect(result).toEqual(updated);
  });

  it("sends PUT to the correct URL with payload", async () => {
    mockFetch(200, fakeMember);

    await updateMember("mem_1", { phone: "48888888888" }, FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/members/mem_1");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({
      phone: "48888888888",
    });
  });

  it("allows setting planId to null (unassign plan)", async () => {
    mockFetch(200, { ...fakeMember, planId: null });

    await updateMember("mem_1", { planId: null }, FAKE_TOKEN);

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ planId: null });
  });

  it("throws ApiError on 404 when member is not found", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Sócio não encontrado",
    });

    await expect(
      updateMember("nonexistent", { name: "X" }, FAKE_TOKEN),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("getMember", () => {
  it("returns MemberResponse on 200", async () => {
    mockFetch(200, fakeMember);

    const result = await getMember("mem_1", FAKE_TOKEN);
    expect(result).toEqual(fakeMember);
  });

  it("sends GET to /api/members/:id with Authorization header", async () => {
    mockFetch(200, fakeMember);

    await getMember("mem_1", FAKE_TOKEN);

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/members/mem_1");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("throws ApiError with status 404 when member does not exist", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Sócio não encontrado",
    });

    await expect(getMember("nonexistent", FAKE_TOKEN)).rejects.toMatchObject({
      status: 404,
      message: "Sócio não encontrado",
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

    await expect(getMember("mem_1", FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
      message: "Sócio não encontrado",
    });
  });
});
