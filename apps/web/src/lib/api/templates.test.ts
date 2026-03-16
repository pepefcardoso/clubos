import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchTemplates,
  upsertTemplate,
  resetTemplate,
  ApiError,
} from "./templates";

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

const fakeTemplates = [
  {
    key: "charge_reminder_d3",
    channel: "WHATSAPP",
    body: "Olá, {nome}! Sua mensalidade vence em 3 dias.",
    isCustom: false,
  },
  {
    key: "charge_reminder_d0",
    channel: "WHATSAPP",
    body: "Olá, {nome}! Sua mensalidade vence hoje.",
    isCustom: true,
  },
  {
    key: "overdue_notice",
    channel: "WHATSAPP",
    body: "Olá, {nome}. Sua mensalidade está em atraso.",
    isCustom: false,
  },
];

describe("fetchTemplates", () => {
  it("returns TemplateListItem[] on 200", async () => {
    mockFetch(200, fakeTemplates);
    const result = await fetchTemplates(FAKE_TOKEN);
    expect(result).toEqual(fakeTemplates);
  });

  it("sends GET to /api/templates with Authorization header", async () => {
    mockFetch(200, fakeTemplates);
    await fetchTemplates(FAKE_TOKEN);
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/templates");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends credentials: include", async () => {
    mockFetch(200, fakeTemplates);
    await fetchTemplates(FAKE_TOKEN);
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });

  it("throws ApiError on 401", async () => {
    mockFetch(401, {
      statusCode: 401,
      error: "Unauthorized",
      message: "Token inválido",
    });
    await expect(fetchTemplates(FAKE_TOKEN)).rejects.toThrow(ApiError);
    await expect(fetchTemplates(FAKE_TOKEN)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("throws ApiError on 403", async () => {
    mockFetch(403, {
      statusCode: 403,
      error: "Forbidden",
      message: "Acesso negado",
    });
    await expect(fetchTemplates(FAKE_TOKEN)).rejects.toMatchObject({
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
    await expect(fetchTemplates(FAKE_TOKEN)).rejects.toMatchObject({
      status: 500,
      message: "Erro ao carregar templates: 500",
    });
  });

  it("preserves error message from JSON body", async () => {
    mockFetch(503, {
      message: "Database timeout",
      error: "Service Unavailable",
    });
    await expect(fetchTemplates(FAKE_TOKEN)).rejects.toMatchObject({
      status: 503,
      message: "Database timeout",
    });
  });
});

describe("upsertTemplate", () => {
  it("sends PUT to /api/templates/:key", async () => {
    mockFetch(200, { success: true });
    await upsertTemplate(
      "charge_reminder_d3",
      { body: "Olá, {nome}!", channel: "WHATSAPP" },
      FAKE_TOKEN,
    );
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/templates/charge_reminder_d3");
    expect(options.method).toBe("PUT");
  });

  it("sends Content-Type: application/json header", async () => {
    mockFetch(200, { success: true });
    await upsertTemplate(
      "charge_reminder_d3",
      { body: "Olá!", channel: "WHATSAPP" },
      FAKE_TOKEN,
    );
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("sends Authorization header with bearer token", async () => {
    mockFetch(200, { success: true });
    await upsertTemplate(
      "charge_reminder_d3",
      { body: "Olá!", channel: "WHATSAPP" },
      FAKE_TOKEN,
    );
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("sends body and channel in request body", async () => {
    mockFetch(200, { success: true });
    await upsertTemplate(
      "overdue_notice",
      { body: "Olá {nome}!", channel: "EMAIL" },
      FAKE_TOKEN,
    );
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body["body"]).toBe("Olá {nome}!");
    expect(body["channel"]).toBe("EMAIL");
  });

  it("throws ApiError on 400 validation error", async () => {
    mockFetch(400, {
      statusCode: 400,
      error: "Bad Request",
      message: "O corpo do template deve ter no mínimo 10 caracteres.",
    });
    await expect(
      upsertTemplate(
        "charge_reminder_d3",
        { body: "curto", channel: "WHATSAPP" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "O corpo do template deve ter no mínimo 10 caracteres.",
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
    await expect(
      upsertTemplate(
        "charge_reminder_d3",
        { body: "Teste", channel: "WHATSAPP" },
        FAKE_TOKEN,
      ),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao salvar template: 500",
    });
  });

  it("sends credentials: include", async () => {
    mockFetch(200, { success: true });
    await upsertTemplate(
      "charge_reminder_d3",
      { body: "Olá!", channel: "WHATSAPP" },
      FAKE_TOKEN,
    );
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });
});

describe("resetTemplate", () => {
  it("sends DELETE to /api/templates/:key", async () => {
    mockFetch(200, { success: true });
    await resetTemplate("charge_reminder_d3", "WHATSAPP", FAKE_TOKEN);
    const [url, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/templates/charge_reminder_d3");
    expect(options.method).toBe("DELETE");
  });

  it("sends channel as query param", async () => {
    mockFetch(200, { success: true });
    await resetTemplate("overdue_notice", "EMAIL", FAKE_TOKEN);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("channel=EMAIL");
  });

  it("sends WHATSAPP channel correctly", async () => {
    mockFetch(200, { success: true });
    await resetTemplate("charge_reminder_d0", "WHATSAPP", FAKE_TOKEN);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("channel=WHATSAPP");
  });

  it("sends Authorization header", async () => {
    mockFetch(200, { success: true });
    await resetTemplate("charge_reminder_d3", "WHATSAPP", FAKE_TOKEN);
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });

  it("throws ApiError on 404", async () => {
    mockFetch(404, {
      statusCode: 404,
      error: "Not Found",
      message: "Template não encontrado.",
    });
    await expect(
      resetTemplate("charge_reminder_d3", "WHATSAPP", FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 404,
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
    await expect(
      resetTemplate("charge_reminder_d3", "WHATSAPP", FAKE_TOKEN),
    ).rejects.toMatchObject({
      status: 500,
      message: "Erro ao restaurar template: 500",
    });
  });

  it("sends credentials: include", async () => {
    mockFetch(200, { success: true });
    await resetTemplate("charge_reminder_d3", "WHATSAPP", FAKE_TOKEN);
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe("include");
  });
});
