import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useCreateMedicalRecord,
  useUpdateMedicalRecord,
  MEDICAL_RECORDS_QUERY_KEY,
} from "./use-medical-records";

const {
  mockUseMutation,
  mockInvalidateQueries,
  mockUseQueryClient,
  mockGetAccessToken,
  mockCreateMedicalRecord,
  mockUpdateMedicalRecord,
} = vi.hoisted(() => {
  const mockInvalidateQueries = vi.fn();
  return {
    mockUseMutation: vi.fn(),
    mockInvalidateQueries,
    mockUseQueryClient: vi.fn(() => ({
      invalidateQueries: mockInvalidateQueries,
    })),
    mockGetAccessToken: vi.fn(),
    mockCreateMedicalRecord: vi.fn(),
    mockUpdateMedicalRecord: vi.fn(),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: mockUseMutation,
  useQuery: vi.fn(),
  useQueryClient: mockUseQueryClient,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));

vi.mock("@/lib/api/medical-records", () => ({
  createMedicalRecord: mockCreateMedicalRecord,
  updateMedicalRecord: mockUpdateMedicalRecord,
  getMedicalRecord: vi.fn(),
  listMedicalRecords: vi.fn(),
  deleteMedicalRecord: vi.fn(),
  MedicalRecordApiError: class MedicalRecordApiError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
      this.name = "MedicalRecordApiError";
    }
  },
}));

const FAKE_TOKEN = "test-access-token";

const fakeRecord = {
  id: "rec_01",
  athleteId: "ath_01",
  athleteName: "Carlos Eduardo",
  protocolId: null,
  occurredAt: "2025-04-01",
  structure: "Isquiotibiais",
  grade: "GRADE_2" as const,
  mechanism: "NON_CONTACT" as const,
  clinicalNotes: null,
  diagnosis: null,
  treatmentDetails: null,
  createdBy: "user_01",
  createdAt: "2025-04-01T10:00:00.000Z",
  updatedAt: "2025-04-01T10:00:00.000Z",
};

describe("MEDICAL_RECORDS_QUERY_KEY", () => {
  it("is ['medical-records']", () => {
    expect(MEDICAL_RECORDS_QUERY_KEY).toEqual(["medical-records"]);
  });
});

describe("useCreateMedicalRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useCreateMedicalRecord();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls createMedicalRecord with payload and token", async () => {
    mockCreateMedicalRecord.mockResolvedValue(fakeRecord);
    useCreateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    const payload = {
      athleteId: "ath_01",
      occurredAt: "2025-04-01",
      structure: "Isquiotibiais",
      grade: "GRADE_2" as const,
      mechanism: "NON_CONTACT" as const,
    };

    const result = await mutationFn(payload);

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockCreateMedicalRecord).toHaveBeenCalledWith(payload, FAKE_TOKEN);
    expect(result).toEqual(fakeRecord);
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useCreateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({
        athleteId: "ath_01",
        occurredAt: "2025-04-01",
        structure: "LCA",
        grade: "GRADE_3",
        mechanism: "CONTACT",
      }),
    ).rejects.toThrow("Não autenticado");
    expect(mockCreateMedicalRecord).not.toHaveBeenCalled();
  });

  it("mutationFn supports optional clinical fields", async () => {
    mockCreateMedicalRecord.mockResolvedValue({
      ...fakeRecord,
      clinicalNotes: "Dor à palpação",
      diagnosis: "M76.3 — Síndrome da banda íleo-tibial",
    });
    useCreateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await mutationFn({
      athleteId: "ath_01",
      occurredAt: "2025-04-01",
      structure: "Isquiotibiais",
      grade: "GRADE_2",
      mechanism: "NON_CONTACT",
      clinicalNotes: "Dor à palpação",
      diagnosis: "M76.3 — Síndrome da banda íleo-tibial",
    });

    expect(mockCreateMedicalRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicalNotes: "Dor à palpação",
        diagnosis: "M76.3 — Síndrome da banda íleo-tibial",
      }),
      FAKE_TOKEN,
    );
  });

  it("onSuccess invalidates MEDICAL_RECORDS_QUERY_KEY", () => {
    useCreateMedicalRecord();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: MEDICAL_RECORDS_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from createMedicalRecord", async () => {
    mockCreateMedicalRecord.mockRejectedValue(
      new Error("Atleta não encontrado"),
    );
    useCreateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      { mutationFn: (p: unknown) => Promise<unknown> },
    ];

    await expect(
      mutationFn({
        athleteId: "nonexistent",
        occurredAt: "2025-04-01",
        structure: "LCA",
        grade: "COMPLETE",
        mechanism: "CONTACT",
      }),
    ).rejects.toThrow("Atleta não encontrado");
  });

  it("uses the query client returned by useQueryClient", () => {
    useCreateMedicalRecord();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});

describe("useUpdateMedicalRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue(FAKE_TOKEN);
    mockUseMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("calls useMutation and returns its result", () => {
    const result = useUpdateMedicalRecord();
    expect(mockUseMutation).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isPending: false });
  });

  it("mutationFn calls updateMedicalRecord with recordId, payload, and token", async () => {
    const updated = { ...fakeRecord, structure: "Quadríceps" };
    mockUpdateMedicalRecord.mockResolvedValue(updated);
    useUpdateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          recordId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    const result = await mutationFn({
      recordId: "rec_01",
      payload: { structure: "Quadríceps" },
    });

    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockUpdateMedicalRecord).toHaveBeenCalledWith(
      "rec_01",
      { structure: "Quadríceps" },
      FAKE_TOKEN,
    );
    expect(result).toEqual(updated);
  });

  it("mutationFn supports setting protocolId to null (clear protocol)", async () => {
    mockUpdateMedicalRecord.mockResolvedValue({
      ...fakeRecord,
      protocolId: null,
    });
    useUpdateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          recordId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({ recordId: "rec_01", payload: { protocolId: null } });

    expect(mockUpdateMedicalRecord).toHaveBeenCalledWith(
      "rec_01",
      { protocolId: null },
      FAKE_TOKEN,
    );
  });

  it("mutationFn supports clearing clinical fields with null", async () => {
    mockUpdateMedicalRecord.mockResolvedValue({
      ...fakeRecord,
      clinicalNotes: null,
      diagnosis: null,
    });
    useUpdateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          recordId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({
      recordId: "rec_01",
      payload: { clinicalNotes: null, diagnosis: null },
    });

    expect(mockUpdateMedicalRecord).toHaveBeenCalledWith(
      "rec_01",
      { clinicalNotes: null, diagnosis: null },
      FAKE_TOKEN,
    );
  });

  it("mutationFn supports updating grade", async () => {
    mockUpdateMedicalRecord.mockResolvedValue({
      ...fakeRecord,
      grade: "GRADE_3",
    });
    useUpdateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          recordId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await mutationFn({ recordId: "rec_01", payload: { grade: "GRADE_3" } });

    expect(mockUpdateMedicalRecord).toHaveBeenCalledWith(
      "rec_01",
      { grade: "GRADE_3" },
      FAKE_TOKEN,
    );
  });

  it("mutationFn throws when no token is available", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    useUpdateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          recordId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({ recordId: "rec_01", payload: { structure: "LCA" } }),
    ).rejects.toThrow("Não autenticado");
    expect(mockUpdateMedicalRecord).not.toHaveBeenCalled();
  });

  it("onSuccess invalidates MEDICAL_RECORDS_QUERY_KEY", () => {
    useUpdateMedicalRecord();

    const [{ onSuccess }] = mockUseMutation.mock.calls[0] as [
      { onSuccess: () => void },
    ];
    onSuccess();

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: MEDICAL_RECORDS_QUERY_KEY,
    });
  });

  it("mutationFn propagates errors from updateMedicalRecord", async () => {
    mockUpdateMedicalRecord.mockRejectedValue(
      new Error("Prontuário não encontrado"),
    );
    useUpdateMedicalRecord();

    const [{ mutationFn }] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: (p: {
          recordId: string;
          payload: unknown;
        }) => Promise<unknown>;
      },
    ];

    await expect(
      mutationFn({
        recordId: "nonexistent",
        payload: { structure: "LCA" },
      }),
    ).rejects.toThrow("Prontuário não encontrado");
  });

  it("uses the query client returned by useQueryClient", () => {
    useUpdateMedicalRecord();
    expect(mockUseQueryClient).toHaveBeenCalled();
  });
});
