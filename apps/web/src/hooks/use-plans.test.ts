import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  usePlans,
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
  PLANS_QUERY_KEY,
} from "./use-plans";

// ── Mocks ──────────────────────────────────────────────────────────────────
// vi.hoisted ensures variables are initialized before the hoisted vi.mock factories run

const {
  mockUseQuery,
  mockUseMutation,
  mockInvalidateQueries,
  mockUseQueryClient,
  mockGetAccessToken,
  mockFetchPlans,
  mockCreatePlan,
  mockUpdatePlan,
  mockDeletePlan,
} = vi.hoisted(() => {
  const mockInvalidateQueries = vi.fn();
  return {
    mockUseQuery: vi.fn(),
    mockUseMutation: vi.fn(),
    mockInvalidateQueries,
    mockUseQueryClient: vi.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
    mockGetAccessToken: vi.fn(),
    mockFetchPlans: vi.fn(),
    mockCreatePlan: vi.fn(),
    mockUpdatePlan: vi.fn(),
    mockDeletePlan: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

vi.mock("@/lib/api/plans", () => ({
  fetchPlans: mockFetchPlans,
  createPlan: mockCreatePlan,
  updatePlan: mockUpdatePlan,
  deletePlan: mockDeletePlan,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const FAKE_TOKEN = "test-token";

const fakePlan = {
  id: "plan_1",
  name: "Sócio Ouro",
  priceCents: 4990,
  interval: "monthly" as const,
  benefits: ["Desconto na lanchonete"],
  isActive: true,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("PLANS_QUERY_KEY", () => {
  it("is ['plans']", () => {
    expect(PLANS_QUERY_KEY).toEqual(["plans"]);
  });
});

describe("usePlans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseQuery.mockReturnValue({ data: [fakePlan], isLoading: false });
  });

  it("calls useQuery and returns its result", () => {
    const result = usePlans();
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: [fakePlan], isLoading: false });
  });

  it("uses PLANS_QUERY_KEY as queryKey", () => {
    usePlans();
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown }];
    expect(config.queryKey).toEqual(PLANS_QUERY_KEY);
  });

  it("queryFn fetches plans with access token", async () => {
    mockFetchPlans.mockResolvedValue([fakePlan]);
    usePlans();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    const result = await queryFn();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetchPlans).toHaveBeenCalledWith(FAKE_TOKEN);
    expect(result).toEqual([fakePlan]);
  });

  it("queryFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    usePlans();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("Não autenticado");
    expect(mockFetchPlans).not.toHaveBeenCalled();
  });

  it("queryFn propagates errors from fetchPlans", async () => {
    mockFetchPlans.mockRejectedValue(new Error("api error"));
    usePlans();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("api error");
  });
});

describe("useCreatePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useCreatePlan();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls createPlan with payload and token", async () => {
    mockCreatePlan.mockResolvedValue(fakePlan);
    useCreatePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];
    const payload = {
      name: "Sócio Ouro",
      priceCents: 4990,
      interval: "monthly" as const,
      benefits: [],
    };

    const result = await mutationFn(payload);

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockCreatePlan).toHaveBeenCalledWith(payload, FAKE_TOKEN);
    expect(result).toEqual(fakePlan);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useCreatePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({
        name: "X",
        priceCents: 100,
        interval: "monthly",
        benefits: [],
      }),
    ).rejects.toThrow("Não autenticado");
    expect(mockCreatePlan).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates PLANS_QUERY_KEY", () => {
    useCreatePlan();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: PLANS_QUERY_KEY,
    });
  });

  it("mutationFn propagates ApiError from createPlan", async () => {
    mockCreatePlan.mockRejectedValue(
      new Error("Já existe um plano com este nome"),
    );
    useCreatePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({
        name: "Dup",
        priceCents: 100,
        interval: "monthly",
        benefits: [],
      }),
    ).rejects.toThrow("Já existe um plano com este nome");
  });
});

describe("useUpdatePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useUpdatePlan();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls updatePlan with planId, payload, and token", async () => {
    const updated = { ...fakePlan, name: "Sócio Diamante" };
    mockUpdatePlan.mockResolvedValue(updated);
    useUpdatePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          planId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    const result = await mutationFn({
      planId: "plan_1",
      payload: { name: "Sócio Diamante" },
    });

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockUpdatePlan).toHaveBeenCalledWith(
      "plan_1",
      { name: "Sócio Diamante" },
      FAKE_TOKEN,
    );
    expect(result).toEqual(updated);
  });

  it("mutationFn supports toggling isActive to false", async () => {
    mockUpdatePlan.mockResolvedValue({ ...fakePlan, isActive: false });
    useUpdatePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          planId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({ planId: "plan_1", payload: { isActive: false } });

    expect(mockUpdatePlan).toHaveBeenCalledWith(
      "plan_1",
      { isActive: false },
      FAKE_TOKEN,
    );
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useUpdatePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          planId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ planId: "plan_1", payload: { name: "X" } }),
    ).rejects.toThrow("Não autenticado");
    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates PLANS_QUERY_KEY", () => {
    useUpdatePlan();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: PLANS_QUERY_KEY,
    });
  });
});

describe("useDeletePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useDeletePlan();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls deletePlan with planId and token", async () => {
    mockDeletePlan.mockResolvedValue(undefined);
    useDeletePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (planId: string) => Promise<unknown> },
    ];

    await mutationFn("plan_1");

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockDeletePlan).toHaveBeenCalledWith("plan_1", FAKE_TOKEN);
  });

  it("mutationFn resolves to undefined on successful deletion", async () => {
    mockDeletePlan.mockResolvedValue(undefined);
    useDeletePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (planId: string) => Promise<unknown> },
    ];

    await expect(mutationFn("plan_1")).resolves.toBeUndefined();
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useDeletePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (planId: string) => Promise<unknown> },
    ];

    await expect(mutationFn("plan_1")).rejects.toThrow("Não autenticado");
    expect(mockDeletePlan).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates PLANS_QUERY_KEY", () => {
    useDeletePlan();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: PLANS_QUERY_KEY,
    });
  });

  it("mutationFn propagates ApiError 409 when plan has active members", async () => {
    mockDeletePlan.mockRejectedValue(
      new Error("Não é possível excluir um plano com sócios ativos vinculados"),
    );
    useDeletePlan();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (planId: string) => Promise<unknown> },
    ];

    await expect(mutationFn("plan_1")).rejects.toThrow(
      "Não é possível excluir um plano com sócios ativos vinculados",
    );
  });
});
