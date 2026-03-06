import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiLogin, apiRefresh, apiLogout, AuthApiError } from "./auth";

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

function mockFetchNoBody(status: number) {
  vi.mocked(fetch).mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("no body");
    },
  } as unknown as Response);
}

describe("apiLogin", () => {
  const fakeResult = {
    accessToken: "tok_abc",
    user: { id: "u1", email: "admin@club.com", role: "ADMIN", clubId: "c1" },
  };

  it("returns LoginResult on 200", async () => {
    mockFetch(200, fakeResult);

    const result = await apiLogin("admin@club.com", "secret");
    expect(result).toEqual(fakeResult);
  });

  it("sends POST with email and password in body", async () => {
    mockFetch(200, fakeResult);

    await apiLogin("admin@club.com", "secret");

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/auth/login");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      email: "admin@club.com",
      password: "secret",
    });
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeResult);

    await apiLogin("admin@club.com", "secret");

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("throws AuthApiError on 401 with server message", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Credenciais inválidas",
    });

    await expect(apiLogin("x@y.com", "wrong")).rejects.toThrow(AuthApiError);
    await expect(apiLogin("x@y.com", "wrong")).rejects.toMatchObject({
      statusCode: 401,
      message: "Credenciais inválidas",
    });
  });

  it("throws AuthApiError with fallback message when body is not JSON", async () => {
    mockFetchNoBody(500);

    await expect(apiLogin("x@y.com", "pass")).rejects.toMatchObject({
      statusCode: 500,
      message: "Erro de conexão. Tente novamente.",
    });
  });
});

describe("apiRefresh", () => {
  it("returns RefreshResult with new accessToken on 200", async () => {
    mockFetch(200, { accessToken: "tok_new" });

    const result = await apiRefresh();
    expect(result).toEqual({ accessToken: "tok_new" });
  });

  it("sends POST to /api/auth/refresh with credentials", async () => {
    mockFetch(200, { accessToken: "tok_new" });

    await apiRefresh();

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/auth/refresh");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
  });

  it("throws AuthApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Refresh token expirado",
    });

    await expect(apiRefresh()).rejects.toMatchObject({
      statusCode: 401,
      message: "Refresh token expirado",
    });
  });
});

describe("apiLogout", () => {
  it("resolves void on 204", async () => {
    mockFetchNoBody(204);

    await expect(apiLogout()).resolves.toBeUndefined();
  });

  it("sends POST to /api/auth/logout", async () => {
    mockFetchNoBody(204);

    await apiLogout();

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/auth/logout");
    expect(options.method).toBe("POST");
  });

  it("includes Authorization header when accessToken is provided", async () => {
    mockFetchNoBody(204);

    await apiLogout("tok_abc");

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer tok_abc",
    );
  });

  it("omits Authorization header when no accessToken is provided", async () => {
    mockFetchNoBody(204);

    await apiLogout();

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(
      (options.headers as Record<string, string>)["Authorization"],
    ).toBeUndefined();
  });

  it("throws AuthApiError on unexpected error response", async () => {
    mockFetch(500, {
      statusCode: 500,
      error: "Internal Server Error",
      message: "Erro interno",
    });

    await expect(apiLogout()).rejects.toMatchObject({ statusCode: 500 });
  });
});
