import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useCreateMember,
  useUpdateMember,
  useRemindMember,
  MEMBERS_QUERY_KEY,
} from "./use-members";

const {
  mockUseMutation,
  mockInvalidateQueries,
  mockUseQueryClient,
  mockGetAccessToken,
  mockCreateMember,
  mockUpdateMember,
  mockRemindMember,
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
    mockRemindMember: vi.fn(),
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

vi.mock("@/lib/api/dashboard", () => ({
  remindMember: mockRemindMember,
}));

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

const fakeRemindResult = {
  messageId: "msg_abc_123",
  status: "SENT" as const,
};

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

describe("useRemindMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("calls useMutation and returns its result", () => {
    const result = useRemindMember();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls remindMember with memberId and token", async () => {
    mockRemindMember.mockResolvedValue(fakeRemindResult);
    useRemindMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (memberId: string) => Promise<unknown> },
    ];
    const result = await mutationFn("mem_1");

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockRemindMember).toHaveBeenCalledWith(FAKE_TOKEN, "mem_1");
    expect(result).toEqual(fakeRemindResult);
  });

  it("mutationFn returns FAILED status when message could not be sent", async () => {
    const failResult = {
      messageId: "msg_xyz",
      status: "FAILED" as const,
      failReason: "Phone unreachable",
    };
    mockRemindMember.mockResolvedValue(failResult);
    useRemindMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (memberId: string) => Promise<unknown> },
    ];
    const result = await mutationFn("mem_1");

    expect(result).toEqual(failResult);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useRemindMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (memberId: string) => Promise<unknown> },
    ];

    await expect(mutationFn("mem_1")).rejects.toThrow("Não autenticado");
    expect(mockRemindMember).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates OVERDUE_MEMBERS_QUERY_KEY", () => {
    useRemindMember();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(["dashboard", "overdue-members"]),
      }),
    );
  });

  it("mutationFn propagates ApiError (e.g. 429) from remindMember", async () => {
    const apiError = Object.assign(new Error("Mensagem já enviada"), {
      status: 429,
    });
    mockRemindMember.mockRejectedValue(apiError);
    useRemindMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (memberId: string) => Promise<unknown> },
    ];

    await expect(mutationFn("mem_1")).rejects.toMatchObject({ status: 429 });
  });

  it("mutationFn propagates generic errors from remindMember", async () => {
    mockRemindMember.mockRejectedValue(new Error("Network error"));
    useRemindMember();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (memberId: string) => Promise<unknown> },
    ];

    await expect(mutationFn("mem_abc")).rejects.toThrow("Network error");
  });

  it("uses the query client returned by useQueryClient", () => {
    useRemindMember();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});
