import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useTemplates,
  useUpsertTemplate,
  useResetTemplate,
  TEMPLATES_QUERY_KEY,
} from "./use-templates";

const {
  mockUseQuery,
  mockUseMutation,
  mockGetAccessToken,
  mockFetchTemplates,
  mockUpsertTemplate,
  mockResetTemplate,
  mockInvalidateQueries,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockGetAccessToken: vi.fn(),
  mockFetchTemplates: vi.fn(),
  mockUpsertTemplate: vi.fn(),
  mockResetTemplate: vi.fn(),
  mockInvalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

vi.mock("@/lib/api/templates", () => ({
  fetchTemplates: mockFetchTemplates,
  upsertTemplate: mockUpsertTemplate,
  resetTemplate: mockResetTemplate,
}));

const FAKE_TOKEN = "test-token";

const fakeTemplates = [
  {
    key: "charge_reminder_d3",
    channel: "WHATSAPP",
    body: "Olá, {nome}!",
    isCustom: false,
  },
  {
    key: "charge_reminder_d0",
    channel: "WHATSAPP",
    body: "Vence hoje, {nome}!",
    isCustom: true,
  },
  {
    key: "overdue_notice",
    channel: "WHATSAPP",
    body: "Atraso, {nome}.",
    isCustom: false,
  },
];

describe("TEMPLATES_QUERY_KEY", () => {
  it("is ['templates']", () => {
    expect(TEMPLATES_QUERY_KEY).toEqual(["templates"]);
  });
});

describe("useTemplates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseQuery.mockReturnValue({ data: fakeTemplates, isLoading: false });
  });

  it("calls useQuery and returns its result", () => {
    const result = useTemplates();
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: fakeTemplates, isLoading: false });
  });

  it("includes TEMPLATES_QUERY_KEY and channel in queryKey", () => {
    useTemplates("WHATSAPP");
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toEqual([...TEMPLATES_QUERY_KEY, "WHATSAPP"]);
  });

  it("includes EMAIL channel in queryKey when specified", () => {
    useTemplates("EMAIL");
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toEqual([...TEMPLATES_QUERY_KEY, "EMAIL"]);
  });

  it("sets staleTime to 60 000 ms", () => {
    useTemplates();
    const [config] = mockUseQuery.mock.calls[0] as [{ staleTime: number }];
    expect(config.staleTime).toBe(60_000);
  });

  it("queryFn fetches templates with access token", async () => {
    mockFetchTemplates.mockResolvedValue(fakeTemplates);
    useTemplates("WHATSAPP");

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    const result = await queryFn();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetchTemplates).toHaveBeenCalledWith(FAKE_TOKEN, "WHATSAPP");
    expect(result).toEqual(fakeTemplates);
  });

  it("queryFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useTemplates();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    await expect(queryFn()).rejects.toThrow("Não autenticado");
    expect(mockFetchTemplates).not.toHaveBeenCalled();
  });

  it("queryFn propagates errors from fetchTemplates", async () => {
    mockFetchTemplates.mockRejectedValue(new Error("network failure"));
    useTemplates();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    await expect(queryFn()).rejects.toThrow("network failure");
  });

  it("defaults to WHATSAPP channel", () => {
    useTemplates();
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toContain("WHATSAPP");
  });
});

describe("useUpsertTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useUpsertTemplate("WHATSAPP");
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("mutateAsync");
  });

  it("mutationFn calls upsertTemplate with token, key, body and channel", async () => {
    mockUpsertTemplate.mockResolvedValue(undefined);
    useUpsertTemplate("WHATSAPP");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (payload: {
          key: string;
          body: string;
        }) => Promise<unknown>;
      },
    ];
    await mutationFn({
      key: "charge_reminder_d3",
      body: "Novo corpo de template.",
    });

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockUpsertTemplate).toHaveBeenCalledWith(
      "charge_reminder_d3",
      { body: "Novo corpo de template.", channel: "WHATSAPP" },
      FAKE_TOKEN,
    );
  });

  it("mutationFn passes EMAIL channel correctly", async () => {
    mockUpsertTemplate.mockResolvedValue(undefined);
    useUpsertTemplate("EMAIL");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (payload: {
          key: string;
          body: string;
        }) => Promise<unknown>;
      },
    ];
    await mutationFn({ key: "charge_reminder_d3", body: "Corpo do e-mail." });

    expect(mockUpsertTemplate).toHaveBeenCalledWith(
      "charge_reminder_d3",
      { body: "Corpo do e-mail.", channel: "EMAIL" },
      FAKE_TOKEN,
    );
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useUpsertTemplate("WHATSAPP");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (payload: {
          key: string;
          body: string;
        }) => Promise<unknown>;
      },
    ];
    await expect(
      mutationFn({ key: "charge_reminder_d3", body: "Corpo." }),
    ).rejects.toThrow("Não autenticado");
    expect(mockUpsertTemplate).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates TEMPLATES_QUERY_KEY", () => {
    useUpsertTemplate("WHATSAPP");

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: TEMPLATES_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from upsertTemplate", async () => {
    mockUpsertTemplate.mockRejectedValue(new Error("400 validation"));
    useUpsertTemplate("WHATSAPP");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (payload: {
          key: string;
          body: string;
        }) => Promise<unknown>;
      },
    ];
    await expect(
      mutationFn({ key: "charge_reminder_d3", body: "Corpo." }),
    ).rejects.toThrow("400 validation");
  });
});

describe("useResetTemplate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useResetTemplate("WHATSAPP");
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("mutateAsync");
  });

  it("mutationFn calls resetTemplate with key and channel", async () => {
    mockResetTemplate.mockResolvedValue(undefined);
    useResetTemplate("WHATSAPP");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (key: string) => Promise<unknown> },
    ];
    await mutationFn("charge_reminder_d3");

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockResetTemplate).toHaveBeenCalledWith(
      "charge_reminder_d3",
      "WHATSAPP",
      FAKE_TOKEN,
    );
  });

  it("mutationFn passes EMAIL channel correctly", async () => {
    mockResetTemplate.mockResolvedValue(undefined);
    useResetTemplate("EMAIL");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (key: string) => Promise<unknown> },
    ];
    await mutationFn("overdue_notice");

    expect(mockResetTemplate).toHaveBeenCalledWith(
      "overdue_notice",
      "EMAIL",
      FAKE_TOKEN,
    );
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useResetTemplate("WHATSAPP");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (key: string) => Promise<unknown> },
    ];
    await expect(mutationFn("charge_reminder_d3")).rejects.toThrow(
      "Não autenticado",
    );
    expect(mockResetTemplate).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates TEMPLATES_QUERY_KEY", () => {
    useResetTemplate("WHATSAPP");

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: TEMPLATES_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from resetTemplate", async () => {
    mockResetTemplate.mockRejectedValue(new Error("network error"));
    useResetTemplate("WHATSAPP");

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (key: string) => Promise<unknown> },
    ];
    await expect(mutationFn("charge_reminder_d3")).rejects.toThrow(
      "network error",
    );
  });
});
