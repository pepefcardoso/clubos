import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useCharges,
  useGenerateCharges,
  CHARGES_QUERY_KEY,
} from "./use-charges";

const {
  mockUseQuery,
  mockUseMutation,
  mockGetAccessToken,
  mockFetchCharges,
  mockGenerateCharges,
  mockInvalidateQueries,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseMutation: vi.fn(),
  mockGetAccessToken: vi.fn(),
  mockFetchCharges: vi.fn(),
  mockGenerateCharges: vi.fn(),
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

vi.mock("@/lib/api/charges", () => ({
  fetchCharges: mockFetchCharges,
  generateCharges: mockGenerateCharges,
}));

const FAKE_TOKEN = "test-token";

const fakeChargesResult = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
};

const fakeGenerateResult = {
  generated: 2,
  skipped: 0,
  errors: [],
  gatewayErrors: [],
  staticPixFallbackCount: 0,
};

describe("CHARGES_QUERY_KEY", () => {
  it("is ['charges']", () => {
    expect(CHARGES_QUERY_KEY).toEqual(["charges"]);
  });
});

describe("useCharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseQuery.mockReturnValue({ data: fakeChargesResult, isLoading: false });
  });

  it("calls useQuery and returns its result", () => {
    const result = useCharges({ page: 1, limit: 20 });
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: fakeChargesResult, isLoading: false });
  });

  it("includes CHARGES_QUERY_KEY and params in queryKey", () => {
    const params = { page: 1, limit: 20, month: "2025-03" };
    useCharges(params);
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toEqual([...CHARGES_QUERY_KEY, params]);
  });

  it("sets staleTime to 30 000 ms", () => {
    useCharges({ page: 1, limit: 20 });
    const [config] = mockUseQuery.mock.calls[0] as [{ staleTime: number }];
    expect(config.staleTime).toBe(30_000);
  });

  it("queryFn fetches charges with access token and params", async () => {
    mockFetchCharges.mockResolvedValue(fakeChargesResult);
    const params = { page: 2, limit: 10, status: "OVERDUE" };
    useCharges(params);

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    const result = await queryFn();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetchCharges).toHaveBeenCalledWith(params, FAKE_TOKEN);
    expect(result).toEqual(fakeChargesResult);
  });

  it("queryFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useCharges({ page: 1, limit: 20 });

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("Não autenticado");
    expect(mockFetchCharges).not.toHaveBeenCalled();
  });

  it("queryFn propagates errors from fetchCharges", async () => {
    mockFetchCharges.mockRejectedValue(new Error("network failure"));
    useCharges({ page: 1, limit: 20 });

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("network failure");
  });
});

describe("useGenerateCharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("calls useMutation and returns its result", () => {
    const result = useGenerateCharges();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("mutateAsync");
  });

  it("mutationFn calls generateCharges with token and payload", async () => {
    mockGenerateCharges.mockResolvedValue(fakeGenerateResult);
    useGenerateCharges();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (payload: Record<string, unknown>) => Promise<unknown> },
    ];
    const payload = { billingPeriod: "2025-03-01T00:00:00.000Z" };
    const result = await mutationFn(payload);

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockGenerateCharges).toHaveBeenCalledWith(payload, FAKE_TOKEN);
    expect(result).toEqual(fakeGenerateResult);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useGenerateCharges();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (payload: Record<string, unknown>) => Promise<unknown> },
    ];

    await expect(mutationFn({})).rejects.toThrow("Não autenticado");
    expect(mockGenerateCharges).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates CHARGES_QUERY_KEY", () => {
    useGenerateCharges();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: CHARGES_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from generateCharges", async () => {
    mockGenerateCharges.mockRejectedValue(new Error("422 no plan"));
    useGenerateCharges();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (payload: Record<string, unknown>) => Promise<unknown> },
    ];

    await expect(mutationFn({})).rejects.toThrow("422 no plan");
  });
});
