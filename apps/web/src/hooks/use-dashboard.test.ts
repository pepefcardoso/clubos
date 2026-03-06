import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useDashboardSummary,
  useChargesHistory,
  useOverdueMembers,
  DASHBOARD_QUERY_KEY,
  CHARGES_HISTORY_QUERY_KEY,
  OVERDUE_MEMBERS_QUERY_KEY,
} from "./use-dashboard";

const {
  mockUseQuery,
  mockGetAccessToken,
  mockFetchDashboardSummary,
  mockFetchChargesHistory,
  mockFetchOverdueMembers,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockGetAccessToken: vi.fn(),
  mockFetchDashboardSummary: vi.fn(),
  mockFetchChargesHistory: vi.fn(),
  mockFetchOverdueMembers: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

vi.mock("@/lib/api/dashboard", () => ({
  fetchDashboardSummary: mockFetchDashboardSummary,
  fetchChargesHistory: mockFetchChargesHistory,
  fetchOverdueMembers: mockFetchOverdueMembers,
}));

const FAKE_TOKEN = "test-token";

const fakeSummary = {
  members: { total: 50, active: 40, inactive: 5, overdue: 5 },
  charges: {
    pendingCount: 2,
    pendingAmountCents: 10000,
    overdueCount: 1,
    overdueAmountCents: 5000,
  },
  payments: { paidThisMonthCount: 30, paidThisMonthAmountCents: 150000 },
};

const fakeHistory = [
  {
    month: "2025-01",
    paid: 40,
    overdue: 2,
    pending: 5,
    paidAmountCents: 200000,
    overdueAmountCents: 10000,
  },
];

const fakeOverdueResult = {
  data: [
    {
      memberId: "mem_1",
      memberName: "João Silva",
      chargeId: "chg_1",
      amountCents: 9900,
      dueDate: "2025-01-10",
      daysPastDue: 55,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

describe("DASHBOARD_QUERY_KEY", () => {
  it("is ['dashboard', 'summary']", () => {
    expect(DASHBOARD_QUERY_KEY).toEqual(["dashboard", "summary"]);
  });
});

describe("CHARGES_HISTORY_QUERY_KEY", () => {
  it("is ['dashboard', 'charges-history']", () => {
    expect(CHARGES_HISTORY_QUERY_KEY).toEqual(["dashboard", "charges-history"]);
  });
});

describe("OVERDUE_MEMBERS_QUERY_KEY", () => {
  it("is ['dashboard', 'overdue-members']", () => {
    expect(OVERDUE_MEMBERS_QUERY_KEY).toEqual(["dashboard", "overdue-members"]);
  });
});

describe("useDashboardSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseQuery.mockReturnValue({ data: fakeSummary, isLoading: false });
  });

  it("calls useQuery and returns its result", () => {
    const result = useDashboardSummary();
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: fakeSummary, isLoading: false });
  });

  it("uses DASHBOARD_QUERY_KEY as queryKey", () => {
    useDashboardSummary();
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown }];
    expect(config.queryKey).toEqual(DASHBOARD_QUERY_KEY);
  });

  it("sets staleTime to 60 000 ms", () => {
    useDashboardSummary();
    const [config] = mockUseQuery.mock.calls[0] as [{ staleTime: number }];
    expect(config.staleTime).toBe(60_000);
  });

  it("queryFn fetches summary with access token", async () => {
    mockFetchDashboardSummary.mockResolvedValue(fakeSummary);
    useDashboardSummary();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    const result = await queryFn();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetchDashboardSummary).toHaveBeenCalledWith(FAKE_TOKEN);
    expect(result).toEqual(fakeSummary);
  });

  it("queryFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useDashboardSummary();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("Não autenticado");
    expect(mockFetchDashboardSummary).not.toHaveBeenCalled();
  });

  it("queryFn propagates errors from fetchDashboardSummary", async () => {
    mockFetchDashboardSummary.mockRejectedValue(new Error("network error"));
    useDashboardSummary();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("network error");
  });
});

describe("useChargesHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseQuery.mockReturnValue({ data: fakeHistory, isLoading: false });
  });

  it("calls useQuery and returns its result", () => {
    const result = useChargesHistory();
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: fakeHistory, isLoading: false });
  });

  it("includes months=6 in queryKey by default", () => {
    useChargesHistory();
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toContain(6);
    expect(config.queryKey).toEqual([...CHARGES_HISTORY_QUERY_KEY, 6]);
  });

  it("includes custom months value in queryKey", () => {
    useChargesHistory(12);
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toEqual([...CHARGES_HISTORY_QUERY_KEY, 12]);
  });

  it("sets staleTime to 60 000 ms", () => {
    useChargesHistory();
    const [config] = mockUseQuery.mock.calls[0] as [{ staleTime: number }];
    expect(config.staleTime).toBe(60_000);
  });

  it("queryFn fetches history with access token and default months", async () => {
    mockFetchChargesHistory.mockResolvedValue(fakeHistory);
    useChargesHistory();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    const result = await queryFn();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetchChargesHistory).toHaveBeenCalledWith(FAKE_TOKEN, 6);
    expect(result).toEqual(fakeHistory);
  });

  it("queryFn passes custom months to fetchChargesHistory", async () => {
    mockFetchChargesHistory.mockResolvedValue(fakeHistory);
    useChargesHistory(3);

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    await queryFn();

    expect(mockFetchChargesHistory).toHaveBeenCalledWith(FAKE_TOKEN, 3);
  });

  it("queryFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useChargesHistory();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("Não autenticado");
    expect(mockFetchChargesHistory).not.toHaveBeenCalled();
  });

  it("queryFn propagates errors from fetchChargesHistory", async () => {
    mockFetchChargesHistory.mockRejectedValue(new Error("api down"));
    useChargesHistory();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("api down");
  });
});

describe("useOverdueMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseQuery.mockReturnValue({
      data: fakeOverdueResult,
      isLoading: false,
      isError: false,
    });
  });

  it("calls useQuery and returns its result", () => {
    const result = useOverdueMembers();
    expect(mockUseQuery).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ data: fakeOverdueResult, isLoading: false });
  });

  it("includes default page=1 and limit=20 in queryKey", () => {
    useOverdueMembers();
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toEqual([...OVERDUE_MEMBERS_QUERY_KEY, 1, 20]);
  });

  it("includes custom page and limit in queryKey", () => {
    useOverdueMembers(3, 10);
    const [config] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }];
    expect(config.queryKey).toEqual([...OVERDUE_MEMBERS_QUERY_KEY, 3, 10]);
  });

  it("sets staleTime to 30 000 ms (shorter than KPI staleTime)", () => {
    useOverdueMembers();
    const [config] = mockUseQuery.mock.calls[0] as [{ staleTime: number }];
    expect(config.staleTime).toBe(30_000);
  });

  it("queryFn fetches overdue members with access token and defaults", async () => {
    mockFetchOverdueMembers.mockResolvedValue(fakeOverdueResult);
    useOverdueMembers();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    const result = await queryFn();

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetchOverdueMembers).toHaveBeenCalledWith(FAKE_TOKEN, 1, 20);
    expect(result).toEqual(fakeOverdueResult);
  });

  it("queryFn passes custom page and limit to fetchOverdueMembers", async () => {
    mockFetchOverdueMembers.mockResolvedValue(fakeOverdueResult);
    useOverdueMembers(2, 10);

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];
    await queryFn();

    expect(mockFetchOverdueMembers).toHaveBeenCalledWith(FAKE_TOKEN, 2, 10);
  });

  it("queryFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useOverdueMembers();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("Não autenticado");
    expect(mockFetchOverdueMembers).not.toHaveBeenCalled();
  });

  it("queryFn propagates errors from fetchOverdueMembers", async () => {
    mockFetchOverdueMembers.mockRejectedValue(new Error("503 unavailable"));
    useOverdueMembers();

    const [{ queryFn }] = mockUseQuery.mock.calls[0] as [
      { queryFn: () => Promise<unknown> },
    ];

    await expect(queryFn()).rejects.toThrow("503 unavailable");
  });
});
