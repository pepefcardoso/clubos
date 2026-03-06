import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClub, ApiError } from "./clubs";

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

const fakeClub = {
  id: "club_1",
  name: "Clube Atlético",
  slug: "clube-atletico",
  cnpj: "12.345.678/0001-99",
  planTier: "FREE",
  createdAt: "2025-01-01T00:00:00.000Z",
};

describe("createClub", () => {
  it("returns CreateClubResponse on 201", async () => {
    mockFetch(201, fakeClub);

    const result = await createClub({
      name: "Clube Atlético",
      slug: "clube-atletico",
      cnpj: "12.345.678/0001-99",
    });

    expect(result).toEqual(fakeClub);
  });

  it("sends POST to /api/clubs with name and slug", async () => {
    mockFetch(201, fakeClub);

    await createClub({ name: "Clube Atlético", slug: "clube-atletico" });

    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/clubs");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string);
    expect(body.name).toBe("Clube Atlético");
    expect(body.slug).toBe("clube-atletico");
  });

  it("includes cnpj in body when provided and non-empty", async () => {
    mockFetch(201, fakeClub);

    await createClub({
      name: "Clube Atlético",
      slug: "clube-atletico",
      cnpj: "12.345.678/0001-99",
    });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.cnpj).toBe("12.345.678/0001-99");
  });

  it("omits cnpj from body when not provided", async () => {
    mockFetch(201, { ...fakeClub, cnpj: null });

    await createClub({ name: "Clube Atlético", slug: "clube-atletico" });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.cnpj).toBeUndefined();
  });

  it("omits cnpj from body when provided as empty string", async () => {
    mockFetch(201, { ...fakeClub, cnpj: null });

    await createClub({
      name: "Clube Atlético",
      slug: "clube-atletico",
      cnpj: "   ",
    });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.cnpj).toBeUndefined();
  });

  it("sets Content-Type to application/json", async () => {
    mockFetch(201, fakeClub);

    await createClub({ name: "Clube", slug: "clube" });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("throws ApiError with status 409 on duplicate slug", async () => {
    mockFetch(409, {
      statusCode: 409,
      error: "Conflict",
      message: "Slug já está em uso",
    });

    await expect(
      createClub({ name: "Clube", slug: "slug-existente" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Slug já está em uso",
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

    await expect(
      createClub({ name: "Clube", slug: "clube" }),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao criar clube",
    });
  });

  it("throws ApiError instance on non-ok response", async () => {
    mockFetch(400, {
      statusCode: 400,
      error: "Bad Request",
      message: "Dados inválidos",
    });

    await expect(createClub({ name: "", slug: "" })).rejects.toThrow(ApiError);
  });
});
