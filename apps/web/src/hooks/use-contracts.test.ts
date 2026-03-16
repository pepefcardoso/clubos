import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useContracts,
  useCreateContract,
  useUpdateContract,
  CONTRACTS_QUERY_KEY,
} from "./use-contracts";

const {
  mockUseMutation,
  mockUseQuery,
  mockInvalidateQueries,
  mockUseQueryClient,
  mockGetAccessToken,
  mockFetchContracts,
  mockCreateContract,
  mockUpdateContract,
} = vi.hoisted(() => {
  const mockInvalidateQueries = vi.fn();
  return {
    mockUseMutation: vi.fn(),
    mockUseQuery: vi.fn(),
    mockInvalidateQueries,
    mockUseQueryClient: vi.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
    mockGetAccessToken: vi.fn(),
    mockFetchContracts: vi.fn(),
    mockCreateContract: vi.fn(),
    mockUpdateContract: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: mockUseMutation,
  useQuery: mockUseQuery,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

vi.mock("@/lib/api/contracts", () => ({
  fetchContracts: mockFetchContracts,
  createContract: mockCreateContract,
  updateContract: mockUpdateContract,
}));

const FAKE_TOKEN = "test-token";

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

describe("CONTRACTS_QUERY_KEY", () => {
  it("is ['contracts']", () => {
    expect(CONTRACTS_QUERY_KEY).toEqual(["contracts"]);
  });
});

describe("useContracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it("calls useQuery and returns its result", () => {
    const result = useContracts({});
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isLoading: false });
  });

  it("queryKey includes CONTRACTS_QUERY_KEY and params", () => {
    const params = { status: "ACTIVE" as const };
    useContracts(params);

    const [{ queryKey }] = mockUseQuery.mock.calls[0] as [
      { queryKey: unknown[] },
    ];
    expect(queryKey).toEqual([...CONTRACTS_QUERY_KEY, params]);
  });

  it("staleTime is 30_000", () => {
    useContracts({});
    const [{ staleTime }] = mockUseQuery.mock.calls[0] as [
      { staleTime: number },
    ];
    expect(staleTime).toBe(30_000);
  });

  it("queryFn calls fetchContracts with params and token", async () => {
    mockFetchContracts.mockResolvedValue({
      data: [fakeContract],
      total: 1,
      page: 1,
      limit: 20,
    });
    const params = { page: 2, limit: 10 };
    useContracts(params);

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    const result = await queryFn();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetchContracts).toHaveBeenCalledWith(params, FAKE_TOKEN);
    expect(result).toMatchObject({ total: 1 });
  });

  it("queryFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useContracts({});

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    await expect(queryFn()).rejects.toThrow("Não autenticado");
    expect(mockFetchContracts).not.toHaveBeenCalled();
  });
});

describe("useCreateContract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useCreateContract();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls createContract with payload and token", async () => {
    mockCreateContract.mockResolvedValue(fakeContract);
    useCreateContract();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];
    const payload = {
      athleteId: "ath_1",
      type: "PROFESSIONAL" as const,
      startDate: "2025-01-01",
    };
    const result = await mutationFn(payload);

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockCreateContract).toHaveBeenCalledWith(payload, FAKE_TOKEN);
    expect(result).toEqual(fakeContract);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useCreateContract();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({
        athleteId: "ath_1",
        type: "PROFESSIONAL",
        startDate: "2025-01-01",
      }),
    ).rejects.toThrow("Não autenticado");
    expect(mockCreateContract).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates CONTRACTS_QUERY_KEY", () => {
    useCreateContract();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: CONTRACTS_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from createContract", async () => {
    mockCreateContract.mockRejectedValue(
      new Error("Atleta já possui contrato ativo"),
    );
    useCreateContract();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({
        athleteId: "ath_1",
        type: "PROFESSIONAL",
        startDate: "2025-01-01",
      }),
    ).rejects.toThrow("Atleta já possui contrato ativo");
  });

  it("uses the query client returned by useQueryClient", () => {
    useCreateContract();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});

describe("useUpdateContract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useUpdateContract();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls updateContract with contractId, payload, and token", async () => {
    const updated = { ...fakeContract, bidRegistered: true };
    mockUpdateContract.mockResolvedValue(updated);
    useUpdateContract();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          contractId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    const result = await mutationFn({
      contractId: "con_1",
      payload: { bidRegistered: true },
    });

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockUpdateContract).toHaveBeenCalledWith(
      "con_1",
      { bidRegistered: true },
      FAKE_TOKEN,
    );
    expect(result).toEqual(updated);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useUpdateContract();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          contractId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ contractId: "con_1", payload: { status: "EXPIRED" } }),
    ).rejects.toThrow("Não autenticado");
    expect(mockUpdateContract).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates CONTRACTS_QUERY_KEY", () => {
    useUpdateContract();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: CONTRACTS_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from updateContract", async () => {
    mockUpdateContract.mockRejectedValue(new Error("Contrato não encontrado"));
    useUpdateContract();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          contractId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ contractId: "nonexistent", payload: { status: "EXPIRED" } }),
    ).rejects.toThrow("Contrato não encontrado");
  });

  it("uses the query client returned by useQueryClient", () => {
    useUpdateContract();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});
