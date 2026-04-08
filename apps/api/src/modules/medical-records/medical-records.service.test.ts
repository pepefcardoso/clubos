import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  createMedicalRecord,
  getMedicalRecordById,
  updateMedicalRecord,
  deleteMedicalRecord,
  listMedicalRecords,
  MedicalRecordNotFoundError,
  AthleteNotFoundError,
  ProtocolNotFoundError,
} from "./medical-records.service.js";

vi.mock("../../lib/crypto.js", () => ({
  encryptField: vi
    .fn()
    .mockResolvedValue(new Uint8Array(Buffer.from("encrypted-bytes"))),
  decryptField: vi.fn().mockResolvedValue("decrypted-plaintext"),
  getEncryptionKey: vi.fn().mockReturnValue("test-key-at-least-32-characters!"),
}));

import { encryptField, decryptField } from "../../lib/crypto.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    athlete: {
      findUnique: vi.fn(),
    },
    injuryProtocol: {
      findUnique: vi.fn(),
    },
    medicalRecord: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    dataAccessLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";
const ACTOR_ID = "user_physio_001";
const ATHLETE_ID = "athlete_001";
const RECORD_ID = "record_001";
const PROTOCOL_ID = "protocol_001";

const BASE_INPUT = {
  athleteId: ATHLETE_ID,
  occurredAt: "2025-03-10",
  structure: "Ligamento cruzado anterior",
  grade: "GRADE_2" as const,
  mechanism: "NON_CONTACT" as const,
};

const ATHLETE_ROW = { id: ATHLETE_ID, name: "Rogério Silva" };
const PROTOCOL_ROW = { id: PROTOCOL_ID };

const RECORD_ROW = {
  id: RECORD_ID,
  athleteId: ATHLETE_ID,
  protocolId: null,
  occurredAt: new Date("2025-03-10"),
  structure: "Ligamento cruzado anterior",
  grade: "GRADE_2",
  mechanism: "NON_CONTACT",
  clinicalNotes: null,
  diagnosis: null,
  treatmentDetails: null,
  createdBy: ACTOR_ID,
  createdAt: new Date("2025-03-10T09:00:00Z"),
  updatedAt: new Date("2025-03-10T09:00:00Z"),
  athlete: { name: "Rogério Silva" },
};

describe("MedicalRecordNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new MedicalRecordNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new MedicalRecordNotFoundError().name).toBe(
      "MedicalRecordNotFoundError",
    );
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new MedicalRecordNotFoundError().message).toMatch(/Prontuário/);
  });

  it("can be caught via instanceof", () => {
    expect(() => {
      throw new MedicalRecordNotFoundError();
    }).toThrowError(MedicalRecordNotFoundError);
  });
});

describe("AthleteNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new AthleteNotFoundError()).toBeInstanceOf(Error);
  });

  it("carries a Portuguese message mentioning atleta", () => {
    expect(new AthleteNotFoundError().message).toMatch(/Atleta/);
  });
});

describe("ProtocolNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new ProtocolNotFoundError()).toBeInstanceOf(Error);
  });

  it("carries a Portuguese message mentioning protocolo", () => {
    expect(new ProtocolNotFoundError().message).toMatch(/Protocolo/);
  });
});

describe("createMedicalRecord()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(
      ATHLETE_ROW as never,
    );
    vi.mocked(prisma.medicalRecord.create).mockResolvedValue(
      RECORD_ROW as never,
    );
    vi.clearAllMocks();
    vi.mocked(encryptField).mockResolvedValue(
      new Uint8Array(Buffer.from("encrypted-bytes")),
    );
    vi.mocked(decryptField).mockResolvedValue("decrypted-plaintext");
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(
      ATHLETE_ROW as never,
    );
    vi.mocked(prisma.medicalRecord.create).mockResolvedValue(
      RECORD_ROW as never,
    );
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("returns the created record with athleteName", async () => {
    const result = await createMedicalRecord(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      BASE_INPUT,
    );
    expect(result.id).toBe(RECORD_ID);
    expect(result.athleteName).toBe("Rogério Silva");
  });

  it("sets occurredAt as a YYYY-MM-DD string", async () => {
    const result = await createMedicalRecord(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      BASE_INPUT,
    );
    expect(result.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("throws AthleteNotFoundError when athlete does not exist", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(null);
    await expect(
      createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT),
    ).rejects.toThrowError(AthleteNotFoundError);
  });

  it("validates protocolId and throws ProtocolNotFoundError when protocol missing", async () => {
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue(null);
    await expect(
      createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, {
        ...BASE_INPUT,
        protocolId: "nonexistent-protocol",
      }),
    ).rejects.toThrowError(ProtocolNotFoundError);
  });

  it("does not check protocol when protocolId is not provided", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.injuryProtocol.findUnique).not.toHaveBeenCalled();
  });

  it("calls encryptField for clinicalNotes when provided", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      clinicalNotes: "Dor ao toque na face lateral",
    });
    expect(encryptField).toHaveBeenCalledWith(
      expect.anything(),
      "Dor ao toque na face lateral",
    );
  });

  it("calls encryptField for diagnosis and treatmentDetails when provided", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      diagnosis: "Ruptura parcial",
      treatmentDetails: "Crioterapia 3x/dia",
    });
    expect(encryptField).toHaveBeenCalledWith(
      expect.anything(),
      "Ruptura parcial",
    );
    expect(encryptField).toHaveBeenCalledWith(
      expect.anything(),
      "Crioterapia 3x/dia",
    );
  });

  it("does NOT call encryptField when clinical fields are absent", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(encryptField).not.toHaveBeenCalled();
  });

  it("stores null for clinical fields not provided", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.medicalRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicalNotes: null,
          diagnosis: null,
          treatmentDetails: null,
        }),
      }),
    );
  });

  it("writes MEDICAL_RECORD_CREATED audit log entry", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "MEDICAL_RECORD_CREATED",
          entityType: "MedicalRecord",
          actorId: ACTOR_ID,
        }),
      }),
    );
  });

  it("stores actorId as createdBy in the persisted record", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.medicalRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdBy: ACTOR_ID }),
      }),
    );
  });

  it("returns plaintext clinical values from input (no decrypt round-trip)", async () => {
    const result = await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, {
      ...BASE_INPUT,
      clinicalNotes: "Dor intensa",
    });
    expect(result.clinicalNotes).toBe("Dor intensa");
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("calls $transaction (withTenantSchema)", async () => {
    await createMedicalRecord(prisma, CLUB_ID, ACTOR_ID, BASE_INPUT);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("getMedicalRecordById()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  const recordWithEncryptedFields = {
    ...RECORD_ROW,
    clinicalNotes: new Uint8Array(Buffer.from("enc-notes")),
    diagnosis: new Uint8Array(Buffer.from("enc-diagnosis")),
    treatmentDetails: null,
  };

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    vi.mocked(decryptField).mockResolvedValue("decrypted-plaintext");
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(
      RECORD_ROW as never,
    );
    vi.mocked(prisma.dataAccessLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("returns the record with athleteName", async () => {
    const result = await getMedicalRecordById(
      prisma,
      CLUB_ID,
      RECORD_ID,
      ACTOR_ID,
    );
    expect(result.id).toBe(RECORD_ID);
    expect(result.athleteName).toBe("Rogério Silva");
  });

  it("throws MedicalRecordNotFoundError for unknown id", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(null);
    await expect(
      getMedicalRecordById(prisma, CLUB_ID, "nonexistent", ACTOR_ID),
    ).rejects.toThrowError(MedicalRecordNotFoundError);
  });

  it("calls decryptField for each non-null encrypted field", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(
      recordWithEncryptedFields as never,
    );
    await getMedicalRecordById(prisma, CLUB_ID, RECORD_ID, ACTOR_ID);
    expect(decryptField).toHaveBeenCalledTimes(2);
  });

  it("does NOT call decryptField when all encrypted fields are null", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(
      RECORD_ROW as never,
    );
    await getMedicalRecordById(prisma, CLUB_ID, RECORD_ID, ACTOR_ID);
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("creates a dataAccessLog entry with correct fieldsRead", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(
      recordWithEncryptedFields as never,
    );
    await getMedicalRecordById(prisma, CLUB_ID, RECORD_ID, ACTOR_ID);
    expect(prisma.dataAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: ACTOR_ID,
          entityId: RECORD_ID,
          entityType: "MedicalRecord",
          action: "READ",
          fieldsRead: expect.arrayContaining(["clinicalNotes", "diagnosis"]),
        }),
      }),
    );
  });

  it("creates dataAccessLog with empty fieldsRead when no encrypted fields present", async () => {
    await getMedicalRecordById(prisma, CLUB_ID, RECORD_ID, ACTOR_ID);
    expect(prisma.dataAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldsRead: [] }),
      }),
    );
  });

  it("creates MEDICAL_RECORD_ACCESSED audit log entry", async () => {
    await getMedicalRecordById(prisma, CLUB_ID, RECORD_ID, ACTOR_ID);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "MEDICAL_RECORD_ACCESSED",
          entityId: RECORD_ID,
        }),
      }),
    );
  });

  it("forwards ipAddress and userAgent into dataAccessLog", async () => {
    await getMedicalRecordById(prisma, CLUB_ID, RECORD_ID, ACTOR_ID, {
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    });
    expect(prisma.dataAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
        }),
      }),
    );
  });

  it("date field is formatted as YYYY-MM-DD string", async () => {
    const result = await getMedicalRecordById(
      prisma,
      CLUB_ID,
      RECORD_ID,
      ACTOR_ID,
    );
    expect(result.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("updateMedicalRecord()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    vi.mocked(encryptField).mockResolvedValue(
      new Uint8Array(Buffer.from("encrypted-bytes")),
    );
    vi.mocked(decryptField).mockResolvedValue("decrypted-plaintext");
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(
      RECORD_ROW as never,
    );
    vi.mocked(prisma.medicalRecord.update).mockResolvedValue(
      RECORD_ROW as never,
    );
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("returns updated record", async () => {
    vi.mocked(prisma.medicalRecord.update).mockResolvedValue({
      ...RECORD_ROW,
      grade: "GRADE_3",
    } as never);
    const result = await updateMedicalRecord(
      prisma,
      CLUB_ID,
      ACTOR_ID,
      RECORD_ID,
      { grade: "GRADE_3" },
    );
    expect(result.grade).toBe("GRADE_3");
  });

  it("throws MedicalRecordNotFoundError for unknown id", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(null);
    await expect(
      updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, "bad-id", {
        structure: "Joelho",
      }),
    ).rejects.toThrowError(MedicalRecordNotFoundError);
  });

  it("validates new protocolId and throws ProtocolNotFoundError", async () => {
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue(null);
    await expect(
      updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID, {
        protocolId: "bad-protocol",
      }),
    ).rejects.toThrowError(ProtocolNotFoundError);
  });

  it("encrypts clinicalNotes when provided", async () => {
    await updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID, {
      clinicalNotes: "Nova anotação clínica",
    });
    expect(encryptField).toHaveBeenCalledWith(
      expect.anything(),
      "Nova anotação clínica",
    );
  });

  it("does NOT encrypt fields absent from input", async () => {
    await updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID, {
      structure: "Tornozelo",
    });
    expect(encryptField).not.toHaveBeenCalled();
  });

  it("setting a clinical field to null stores null (clears the field)", async () => {
    await updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID, {
      clinicalNotes: null,
    });
    const call = vi.mocked(prisma.medicalRecord.update).mock.calls[0]?.[0];
    expect(call?.data).toMatchObject({ clinicalNotes: null });
    expect(encryptField).not.toHaveBeenCalled();
  });

  it("only passes supplied fields to Prisma update", async () => {
    await updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID, {
      structure: "Ombro",
    });
    const call = vi.mocked(prisma.medicalRecord.update).mock.calls[0]?.[0];
    expect(call?.data).toEqual({ structure: "Ombro" });
  });

  it("writes MEDICAL_RECORD_UPDATED audit log entry", async () => {
    await updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID, {
      grade: "GRADE_1",
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "MEDICAL_RECORD_UPDATED" }),
      }),
    );
  });

  it("decrypts the post-update clinical fields for response", async () => {
    vi.mocked(prisma.medicalRecord.update).mockResolvedValue({
      ...RECORD_ROW,
      clinicalNotes: new Uint8Array(Buffer.from("enc")),
    } as never);
    await updateMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID, {
      clinicalNotes: "Updated notes",
    });
    expect(decryptField).toHaveBeenCalled();
  });
});

describe("deleteMedicalRecord()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: RECORD_ID,
      athleteId: ATHLETE_ID,
      structure: "Ligamento cruzado anterior",
      grade: "GRADE_2",
      occurredAt: new Date("2025-03-10"),
    } as never);
    vi.mocked(prisma.medicalRecord.delete).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("resolves without error on valid id", async () => {
    await expect(
      deleteMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID),
    ).resolves.not.toThrow();
  });

  it("throws MedicalRecordNotFoundError for unknown id", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(null);
    await expect(
      deleteMedicalRecord(prisma, CLUB_ID, ACTOR_ID, "bad-id"),
    ).rejects.toThrowError(MedicalRecordNotFoundError);
  });

  it("calls medicalRecord.delete with the correct id", async () => {
    await deleteMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID);
    expect(prisma.medicalRecord.delete).toHaveBeenCalledWith({
      where: { id: RECORD_ID },
    });
  });

  it("writes an audit log entry with deleted: true in metadata", async () => {
    await deleteMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID);
    const call = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0];
    expect(call?.data.metadata).toMatchObject({
      deleted: true,
      athleteId: ATHLETE_ID,
    });
  });

  it("audit log metadata includes structure and grade for traceability", async () => {
    await deleteMedicalRecord(prisma, CLUB_ID, ACTOR_ID, RECORD_ID);
    const call = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0];
    expect(call?.data.metadata).toMatchObject({
      structure: "Ligamento cruzado anterior",
      grade: "GRADE_2",
    });
  });
});

describe("listMedicalRecords()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  const rowWithAthlete = { ...RECORD_ROW };

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    vi.mocked(prisma.medicalRecord.findMany).mockResolvedValue([
      rowWithAthlete,
    ] as never);
    vi.mocked(prisma.medicalRecord.count).mockResolvedValue(1);
  });

  it("returns paginated response with data and total", async () => {
    const result = await listMedicalRecords(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("does NOT call decryptField — list returns summaries only", async () => {
    await listMedicalRecords(prisma, CLUB_ID, { page: 1, limit: 20 });
    expect(decryptField).not.toHaveBeenCalled();
  });

  it("does NOT create dataAccessLog entries", async () => {
    await listMedicalRecords(prisma, CLUB_ID, { page: 1, limit: 20 });
    expect(prisma.dataAccessLog.create).not.toHaveBeenCalled();
  });

  it("response items do NOT include clinicalNotes, diagnosis, treatmentDetails", async () => {
    const result = await listMedicalRecords(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });
    const item = result.data[0];
    expect(item).not.toHaveProperty("clinicalNotes");
    expect(item).not.toHaveProperty("diagnosis");
    expect(item).not.toHaveProperty("treatmentDetails");
  });

  it("passes athleteId filter to Prisma where clause", async () => {
    await listMedicalRecords(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      athleteId: ATHLETE_ID,
    });
    const call = vi.mocked(prisma.medicalRecord.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ athleteId: ATHLETE_ID });
  });

  it("passes grade filter to Prisma where clause", async () => {
    await listMedicalRecords(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      grade: "GRADE_3",
    });
    const call = vi.mocked(prisma.medicalRecord.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ grade: "GRADE_3" });
  });

  it("applies from/to date range filter on occurredAt", async () => {
    await listMedicalRecords(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
      from: "2025-01-01",
      to: "2025-03-31",
    });
    const call = vi.mocked(prisma.medicalRecord.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      occurredAt: { gte: expect.any(Date), lte: expect.any(Date) },
    });
  });

  it("orders results by occurredAt desc", async () => {
    await listMedicalRecords(prisma, CLUB_ID, { page: 1, limit: 20 });
    const call = vi.mocked(prisma.medicalRecord.findMany).mock.calls[0]?.[0];
    expect(call?.orderBy).toEqual({ occurredAt: "desc" });
  });

  it("returns empty data array when no records match", async () => {
    vi.mocked(prisma.medicalRecord.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.medicalRecord.count).mockResolvedValue(0);
    const result = await listMedicalRecords(prisma, CLUB_ID, {
      page: 1,
      limit: 20,
    });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("calls $transaction (withTenantSchema)", async () => {
    await listMedicalRecords(prisma, CLUB_ID, { page: 1, limit: 20 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
