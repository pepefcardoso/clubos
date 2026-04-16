import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockWithTenantSchema,
  mockDecryptField,
  mockEncryptField,
  mockPrismaClubFindUnique,
  mockPrismaUserFindUnique,
  mockMedicalRecordFindUnique,
  mockDataAccessLogCreate,
  mockAuditLogCreate,
} = vi.hoisted(() => {
  const mockDataAccessLogCreate = vi.fn().mockResolvedValue({});
  const mockAuditLogCreate = vi.fn().mockResolvedValue({});
  const mockMedicalRecordFindUnique = vi.fn();

  let callCount = 0;
  const mockWithTenantSchema = vi.fn(
    async (
      _prisma: unknown,
      _clubId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => {
      callCount++;
      const tx = {
        medicalRecord: {
          findUnique: mockMedicalRecordFindUnique,
        },
        dataAccessLog: { create: mockDataAccessLogCreate },
        auditLog: { create: mockAuditLogCreate },
      };
      return fn(tx);
    },
  );

  return {
    mockWithTenantSchema,
    mockDecryptField: vi.fn(),
    mockEncryptField: vi.fn(),
    mockPrismaClubFindUnique: vi.fn(),
    mockPrismaUserFindUnique: vi.fn(),
    mockMedicalRecordFindUnique,
    mockDataAccessLogCreate,
    mockAuditLogCreate,
  };
});

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: mockWithTenantSchema,
  isPrismaUniqueConstraintError: vi.fn(),
}));

vi.mock("../../lib/crypto.js", () => ({
  encryptField: mockEncryptField,
  decryptField: mockDecryptField,
  getEncryptionKey: vi.fn(() => "test-key-32-chars-long-xxxxxxxxxx"),
}));

const BASE_RECORD = {
  id: "rec_01",
  athleteId: "ath_01",
  protocolId: null,
  occurredAt: new Date("2025-04-01T00:00:00.000Z"),
  structure: "Isquiotibiais",
  grade: "GRADE_2",
  mechanism: "NON_CONTACT",
  clinicalNotes: null,
  diagnosis: null,
  treatmentDetails: null,
  createdBy: "user_01",
  createdAt: new Date("2025-04-01T10:00:00.000Z"),
  updatedAt: new Date("2025-04-01T10:00:00.000Z"),
  athlete: {
    name: "Carlos Eduardo",
    birthDate: new Date("2000-06-15T00:00:00.000Z"),
    position: "Atacante",
  },
  protocol: null,
};

const ENCRYPTED_BYTES = new Uint8Array([1, 2, 3, 4]);

async function getService() {
  const mod = await import("./medical-records.service.js");
  return mod;
}

describe("generateMedicalRecordReportPdf", () => {
  const mockPrisma = {
    club: { findUnique: mockPrismaClubFindUnique },
    user: { findUnique: mockPrismaUserFindUnique },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockMedicalRecordFindUnique.mockResolvedValue(BASE_RECORD);

    mockPrismaClubFindUnique.mockResolvedValue({ name: "Clube Teste FC" });
    mockPrismaUserFindUnique.mockResolvedValue({
      email: "physio@clubeteste.com",
      role: "PHYSIO",
    });
  });

  it("returns a Buffer whose first bytes are the PDF magic bytes (%PDF)", async () => {
    const { generateMedicalRecordReportPdf } = await getService();

    const result = await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("throws MedicalRecordNotFoundError when the record does not exist", async () => {
    mockMedicalRecordFindUnique.mockResolvedValue(null);

    const { generateMedicalRecordReportPdf, MedicalRecordNotFoundError } =
      await getService();

    await expect(
      generateMedicalRecordReportPdf(
        mockPrisma as never,
        "club_01",
        "nonexistent",
        "user_01",
      ),
    ).rejects.toThrow(MedicalRecordNotFoundError);
  });

  it("writes a data_access_log entry with action EXPORT_PDF", async () => {
    const { generateMedicalRecordReportPdf } = await getService();

    await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
      { ipAddress: "127.0.0.1", userAgent: "TestAgent/1.0" },
    );

    expect(mockDataAccessLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "EXPORT_PDF",
          entityId: "rec_01",
          entityType: "MedicalRecord",
          actorId: "user_01",
        }),
      }),
    );
  });

  it("writes an audit_log entry with action MEDICAL_RECORD_ACCESSED and exportFormat pdf", async () => {
    const { generateMedicalRecordReportPdf } = await getService();

    await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
    );

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "MEDICAL_RECORD_ACCESSED",
          entityId: "rec_01",
          metadata: expect.objectContaining({ exportFormat: "pdf" }),
        }),
      }),
    );
  });

  it("decrypts clinicalNotes when the field is set", async () => {
    mockMedicalRecordFindUnique.mockResolvedValue({
      ...BASE_RECORD,
      clinicalNotes: ENCRYPTED_BYTES,
    });
    mockDecryptField.mockResolvedValue("Dor à palpação");

    const { generateMedicalRecordReportPdf } = await getService();

    await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
    );

    expect(mockDecryptField).toHaveBeenCalledWith(
      expect.anything(),
      ENCRYPTED_BYTES,
    );

    expect(mockDataAccessLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fieldsRead: expect.arrayContaining(["clinicalNotes"]),
        }),
      }),
    );
  });

  it("does not call decryptField when all clinical fields are null", async () => {
    const { generateMedicalRecordReportPdf } = await getService();

    await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
    );

    expect(mockDecryptField).not.toHaveBeenCalled();

    expect(mockDataAccessLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldsRead: [] }),
      }),
    );
  });

  it("includes protocol data in the PDF when protocolId is set", async () => {
    const protocol = {
      id: "proto_01",
      name: "Protocolo Isquiotibiais Grau II",
      durationDays: 21,
      steps: [
        { day: "1-3", activity: "Repouso + crioterapia" },
        { day: "4-7", activity: "Mobilização passiva" },
      ],
    };

    mockMedicalRecordFindUnique.mockResolvedValue({
      ...BASE_RECORD,
      protocolId: "proto_01",
      protocol,
    });

    const { generateMedicalRecordReportPdf } = await getService();

    const result = await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("queries club and user from the public schema (root prisma, not tenant tx)", async () => {
    const { generateMedicalRecordReportPdf } = await getService();

    await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
    );

    expect(mockPrismaClubFindUnique).toHaveBeenCalledWith({
      where: { id: "club_01" },
      select: { name: true },
    });
    expect(mockPrismaUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user_01" },
      select: { email: true, role: true },
    });
  });

  it("falls back to clubId/actorId when club/user are not found", async () => {
    mockPrismaClubFindUnique.mockResolvedValue(null);
    mockPrismaUserFindUnique.mockResolvedValue(null);

    const { generateMedicalRecordReportPdf } = await getService();

    const result = await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_fallback",
    );

    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("forwards ipAddress and userAgent to the data_access_log entry", async () => {
    const { generateMedicalRecordReportPdf } = await getService();

    await generateMedicalRecordReportPdf(
      mockPrisma as never,
      "club_01",
      "rec_01",
      "user_01",
      { ipAddress: "10.0.0.1", userAgent: "Mozilla/5.0" },
    );

    expect(mockDataAccessLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "10.0.0.1",
          userAgent: "Mozilla/5.0",
        }),
      }),
    );
  });
});