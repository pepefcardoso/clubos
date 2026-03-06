import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useCreateMember,
  useUpdateMember,
  MEMBERS_QUERY_KEY,
} from "./use-members";

// ── Mocks ──────────────────────────────────────────────────────────────────
// vi.hoisted ensures variables are initialized before the hoisted vi.mock factories run

const {
  mockUseMutation,
  mockInvalidateQueries,
  mockUseQueryClient,
  mockGetAccessToken,
  mockCreateMember,
  mockUpdateMember,
} = vi.hoisted(() => {
  const mockInvalidateQueries = vi.fn();
  return {
    mockUseMutation: vi.fn(),
    mockInvalidateQueries,
    mockUseQueryClient: vi.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
    mockGetAccessToken: vi.fn(),
    mockCreateMember: vi.fn(),
    mockUpdateMember: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

vi.mock("@/lib/api/members", () => ({
  createMember: mockCreateMember,
  updateMember: mockUpdateMember,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const FAKE_TOKEN = "test-token";

const fakeMember = {
  id: "mem_1",
  name: "Ana Lima",
  cpf: "111.222.333-44",
  phone: "48900000000",
  email: "ana@clube.com",
  status: "ACTIVE" as const,
  planId: "plan_1",
  joinedAt: "2025-01-01T00:00:00.000Z",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("MEMBERS_QUERY_KEY", () => {
  it("is ['members']", () => {
    expect(MEMBERS_QUERY_KEY).toEqual(["members"]);
  });
});

describe("useCreateMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useCreateMember();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls createMember with payload and token", async () => {
    mockCreateMember.mockResolvedValue(fakeMember);
    useCreateMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];
    const payload = {
      name: "Ana Lima",
      cpf: "111.222.333-44",
      phone: "48900000000",
    };

    const result = await mutationFn(payload);

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockCreateMember).toHaveBeenCalledWith(payload, FAKE_TOKEN);
    expect(result).toEqual(fakeMember);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useCreateMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({ name: "X", cpf: "000.000.000-00", phone: "48000000000" }),
    ).rejects.toThrow("Não autenticado");
    expect(mockCreateMember).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates MEMBERS_QUERY_KEY", () => {
    useCreateMember();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: MEMBERS_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from createMember", async () => {
    mockCreateMember.mockRejectedValue(new Error("CPF duplicado"));
    useCreateMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({ name: "X", cpf: "111.222.333-44", phone: "48000000000" }),
    ).rejects.toThrow("CPF duplicado");
  });

  it("uses the query client returned by useQueryClient", () => {
    useCreateMember();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});

describe("useUpdateMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useUpdateMember();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls updateMember with memberId, payload, and token", async () => {
    const updated = { ...fakeMember, name: "Ana Atualizada" };
    mockUpdateMember.mockResolvedValue(updated);
    useUpdateMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          memberId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    const result = await mutationFn({
      memberId: "mem_1",
      payload: { name: "Ana Atualizada" },
    });

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockUpdateMember).toHaveBeenCalledWith(
      "mem_1",
      { name: "Ana Atualizada" },
      FAKE_TOKEN,
    );
    expect(result).toEqual(updated);
  });

  it("mutationFn supports setting planId to null", async () => {
    mockUpdateMember.mockResolvedValue({ ...fakeMember, planId: null });
    useUpdateMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          memberId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({ memberId: "mem_1", payload: { planId: null } });

    expect(mockUpdateMember).toHaveBeenCalledWith(
      "mem_1",
      { planId: null },
      FAKE_TOKEN,
    );
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useUpdateMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          memberId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ memberId: "mem_1", payload: { name: "X" } }),
    ).rejects.toThrow("Não autenticado");
    expect(mockUpdateMember).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates MEMBERS_QUERY_KEY", () => {
    useUpdateMember();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: MEMBERS_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from updateMember", async () => {
    mockUpdateMember.mockRejectedValue(new Error("Sócio não encontrado"));
    useUpdateMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          memberId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ memberId: "nonexistent", payload: { name: "X" } }),
    ).rejects.toThrow("Sócio não encontrado");
  });
});
