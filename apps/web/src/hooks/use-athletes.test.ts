import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useCreateAthlete,
  useUpdateAthlete,
  ATHLETES_QUERY_KEY,
} from "./use-athletes";

const {
  mockUseMutation,
  mockInvalidateQueries,
  mockUseQueryClient,
  mockGetAccessToken,
  mockCreateAthlete,
  mockUpdateAthlete,
} = vi.hoisted(() => {
  const mockInvalidateQueries = vi.fn();
  return {
    mockUseMutation: vi.fn(),
    mockInvalidateQueries,
    mockUseQueryClient: vi.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
    mockGetAccessToken: vi.fn(),
    mockCreateAthlete: vi.fn(),
    mockUpdateAthlete: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

vi.mock("@/lib/api/athletes", () => ({
  createAthlete: mockCreateAthlete,
  updateAthlete: mockUpdateAthlete,
}));

const FAKE_TOKEN = "test-token";

const fakeAthlete = {
  id: "ath_1",
  name: "Carlos Eduardo",
  cpf: "12345678900",
  birthDate: "1998-06-15",
  position: "Atacante",
  status: "ACTIVE" as const,
  createdAt: "2025-01-01T00:00:00.000Z",
};

describe("ATHLETES_QUERY_KEY", () => {
  it("is ['athletes']", () => {
    expect(ATHLETES_QUERY_KEY).toEqual(["athletes"]);
  });
});

describe("useCreateAthlete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useCreateAthlete();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls createAthlete with payload and token", async () => {
    mockCreateAthlete.mockResolvedValue(fakeAthlete);
    useCreateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];
    const payload = {
      name: "Carlos Eduardo",
      cpf: "12345678900",
      birthDate: "1998-06-15",
      position: "Atacante",
    };

    const result = await mutationFn(payload);

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockCreateAthlete).toHaveBeenCalledWith(payload, FAKE_TOKEN);
    expect(result).toEqual(fakeAthlete);
  });

  it("mutationFn works without optional position field", async () => {
    mockCreateAthlete.mockResolvedValue({ ...fakeAthlete, position: null });
    useCreateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];
    const payload = {
      name: "Carlos Eduardo",
      cpf: "12345678900",
      birthDate: "1998-06-15",
    };

    await mutationFn(payload);

    expect(mockCreateAthlete).toHaveBeenCalledWith(payload, FAKE_TOKEN);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useCreateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({ name: "X", cpf: "00000000000", birthDate: "1990-01-01" }),
    ).rejects.toThrow("Não autenticado");
    expect(mockCreateAthlete).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates ATHLETES_QUERY_KEY", () => {
    useCreateAthlete();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ATHLETES_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from createAthlete", async () => {
    mockCreateAthlete.mockRejectedValue(new Error("CPF duplicado"));
    useCreateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({ name: "X", cpf: "12345678900", birthDate: "1998-01-01" }),
    ).rejects.toThrow("CPF duplicado");
  });

  it("uses the query client returned by useQueryClient", () => {
    useCreateAthlete();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});

describe("useUpdateAthlete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useUpdateAthlete();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls updateAthlete with athleteId, payload, and token", async () => {
    const updated = { ...fakeAthlete, name: "Carlos Atualizado" };
    mockUpdateAthlete.mockResolvedValue(updated);
    useUpdateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          athleteId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    const result = await mutationFn({
      athleteId: "ath_1",
      payload: { name: "Carlos Atualizado" },
    });

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockUpdateAthlete).toHaveBeenCalledWith(
      "ath_1",
      { name: "Carlos Atualizado" },
      FAKE_TOKEN,
    );
    expect(result).toEqual(updated);
  });

  it("mutationFn supports setting position to null (clear position)", async () => {
    mockUpdateAthlete.mockResolvedValue({ ...fakeAthlete, position: null });
    useUpdateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          athleteId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({ athleteId: "ath_1", payload: { position: null } });

    expect(mockUpdateAthlete).toHaveBeenCalledWith(
      "ath_1",
      { position: null },
      FAKE_TOKEN,
    );
  });

  it("mutationFn supports updating status to SUSPENDED", async () => {
    mockUpdateAthlete.mockResolvedValue({
      ...fakeAthlete,
      status: "SUSPENDED",
    });
    useUpdateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          athleteId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({
      athleteId: "ath_1",
      payload: { status: "SUSPENDED" },
    });

    expect(mockUpdateAthlete).toHaveBeenCalledWith(
      "ath_1",
      { status: "SUSPENDED" },
      FAKE_TOKEN,
    );
  });

  it("mutationFn supports updating status to INACTIVE", async () => {
    mockUpdateAthlete.mockResolvedValue({ ...fakeAthlete, status: "INACTIVE" });
    useUpdateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          athleteId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({
      athleteId: "ath_1",
      payload: { status: "INACTIVE" },
    });

    expect(mockUpdateAthlete).toHaveBeenCalledWith(
      "ath_1",
      { status: "INACTIVE" },
      FAKE_TOKEN,
    );
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useUpdateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          athleteId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ athleteId: "ath_1", payload: { name: "X" } }),
    ).rejects.toThrow("Não autenticado");
    expect(mockUpdateAthlete).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates ATHLETES_QUERY_KEY", () => {
    useUpdateAthlete();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ATHLETES_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from updateAthlete", async () => {
    mockUpdateAthlete.mockRejectedValue(new Error("Atleta não encontrado"));
    useUpdateAthlete();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          athleteId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ athleteId: "nonexistent", payload: { name: "X" } }),
    ).rejects.toThrow("Atleta não encontrado");
  });

  it("uses the query client returned by useQueryClient", () => {
    useUpdateAthlete();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});
