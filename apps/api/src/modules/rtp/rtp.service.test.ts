import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  getRtp,
  upsertRtp,
  AthleteNotFoundError,
  MedicalRecordNotFoundError,
  ProtocolNotFoundError,
} from "./rtp.service.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    athlete: {
      findUnique: vi.fn(),
    },
    returnToPlay: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    medicalRecord: {
      findUnique: vi.fn(),
    },
    injuryProtocol: {
      findUnique: vi.fn(),
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

const NOW = new Date("2025-06-01T10:00:00Z");

const RTP_ROW = {
  id: "rtp_001",
  athleteId: ATHLETE_ID,
  status: "AFASTADO",
  medicalRecordId: null,
  protocolId: null,
  clearedAt: null,
  clearedBy: null,
  notes: "Dor no joelho esquerdo",
  createdAt: NOW,
  updatedAt: NOW,
};

describe("AthleteNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new AthleteNotFoundError()).toBeInstanceOf(Error);
  });
  it("has the correct name", () => {
    expect(new AthleteNotFoundError().name).toBe("AthleteNotFoundError");
  });
  it("carries a Portuguese message mentioning atleta", () => {
    expect(new AthleteNotFoundError().message).toMatch(/Atleta/);
  });
  it("can be caught via instanceof", () => {
    expect(() => {
      throw new AthleteNotFoundError();
    }).toThrowError(AthleteNotFoundError);
  });
});

describe("MedicalRecordNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new MedicalRecordNotFoundError()).toBeInstanceOf(Error);
  });
  it("carries a Portuguese message mentioning Prontuário", () => {
    expect(new MedicalRecordNotFoundError().message).toMatch(/Prontuário/);
  });
});

describe("ProtocolNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new ProtocolNotFoundError()).toBeInstanceOf(Error);
  });
  it("carries a Portuguese message mentioning Protocolo", () => {
    expect(new ProtocolNotFoundError().message).toMatch(/Protocolo/);
  });
});

describe("getRtp()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
  });

  it("throws AthleteNotFoundError when athlete does not exist", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(null);
    await expect(getRtp(prisma, CLUB_ID, ATHLETE_ID)).rejects.toThrowError(
      AthleteNotFoundError,
    );
  });

  it("returns null when athlete exists but has no RTP record", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(null);

    const result = await getRtp(prisma, CLUB_ID, ATHLETE_ID);
    expect(result).toBeNull();
  });

  it("returns the full RTP payload when a record exists", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(
      RTP_ROW as never,
    );

    const result = await getRtp(prisma, CLUB_ID, ATHLETE_ID);
    expect(result).not.toBeNull();
    expect(result?.athleteId).toBe(ATHLETE_ID);
    expect(result?.status).toBe("AFASTADO");
    expect(result?.notes).toBe("Dor no joelho esquerdo");
    expect(result?.clearedAt).toBeNull();
    expect(result?.clearedBy).toBeNull();
  });

  it("formats updatedAt as ISO string", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(
      RTP_ROW as never,
    );

    const result = await getRtp(prisma, CLUB_ID, ATHLETE_ID);
    expect(result?.updatedAt).toBe(NOW.toISOString());
  });

  it("formats clearedAt as ISO string when set", async () => {
    const clearedRow = { ...RTP_ROW, clearedAt: NOW, clearedBy: ACTOR_ID };
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(
      clearedRow as never,
    );

    const result = await getRtp(prisma, CLUB_ID, ATHLETE_ID);
    expect(result?.clearedAt).toBe(NOW.toISOString());
    expect(result?.clearedBy).toBe(ACTOR_ID);
  });

  it("calls $transaction (withTenantSchema)", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(null);
    await getRtp(prisma, CLUB_ID, ATHLETE_ID);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("upsertRtp()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue({
      id: ATHLETE_ID,
    } as never);
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.returnToPlay.upsert).mockResolvedValue(RTP_ROW as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it("throws AthleteNotFoundError when athlete does not exist", async () => {
    vi.mocked(prisma.athlete.findUnique).mockResolvedValue(null);
    await expect(
      upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
        status: "AFASTADO",
      }),
    ).rejects.toThrowError(AthleteNotFoundError);
  });

  it("throws MedicalRecordNotFoundError when medicalRecordId does not exist", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue(null);
    await expect(
      upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
        status: "AFASTADO",
        medicalRecordId: "bad-record",
      }),
    ).rejects.toThrowError(MedicalRecordNotFoundError);
  });

  it("does NOT check medicalRecord when medicalRecordId is absent", async () => {
    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
    });
    expect(prisma.medicalRecord.findUnique).not.toHaveBeenCalled();
  });

  it("throws ProtocolNotFoundError when protocolId does not exist", async () => {
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue(null);
    await expect(
      upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
        status: "AFASTADO",
        protocolId: "bad-protocol",
      }),
    ).rejects.toThrowError(ProtocolNotFoundError);
  });

  it("does NOT check protocol when protocolId is absent", async () => {
    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
    });
    expect(prisma.injuryProtocol.findUnique).not.toHaveBeenCalled();
  });

  it("validates both medicalRecordId and protocolId when both are provided", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: RECORD_ID,
    } as never);
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue({
      id: PROTOCOL_ID,
    } as never);
    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "RETORNO_PROGRESSIVO",
      medicalRecordId: RECORD_ID,
      protocolId: PROTOCOL_ID,
    });
    expect(prisma.medicalRecord.findUnique).toHaveBeenCalledWith({
      where: { id: RECORD_ID },
      select: { id: true },
    });
    expect(prisma.injuryProtocol.findUnique).toHaveBeenCalledWith({
      where: { id: PROTOCOL_ID },
      select: { id: true },
    });
  });

  it("sets clearedAt and clearedBy when transitioning TO LIBERADO for the first time", async () => {
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.returnToPlay.upsert).mockResolvedValue({
      ...RTP_ROW,
      status: "LIBERADO",
      clearedAt: new Date(),
      clearedBy: ACTOR_ID,
    } as never);

    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "LIBERADO",
    });

    const upsertCall = vi.mocked(prisma.returnToPlay.upsert).mock.calls[0]?.[0];
    expect(upsertCall?.create).toMatchObject({ clearedBy: ACTOR_ID });
    expect(upsertCall?.update?.clearedAt).toBeInstanceOf(Date);
    expect(upsertCall?.update?.clearedBy).toBe(ACTOR_ID);
  });

  it("does NOT re-stamp clearedAt when already LIBERADO (idempotent)", async () => {
    const originalClearedAt = new Date("2025-05-01T00:00:00Z");
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue({
      status: "LIBERADO",
      clearedAt: originalClearedAt,
      clearedBy: "original_actor",
    } as never);
    vi.mocked(prisma.returnToPlay.upsert).mockResolvedValue({
      ...RTP_ROW,
      status: "LIBERADO",
      clearedAt: originalClearedAt,
      clearedBy: "original_actor",
    } as never);

    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "LIBERADO",
    });

    const upsertCall = vi.mocked(prisma.returnToPlay.upsert).mock.calls[0]?.[0];
    expect(upsertCall?.update?.clearedAt).toEqual(originalClearedAt);
    expect(upsertCall?.update?.clearedBy).toBe("original_actor");
  });

  it("clears clearedAt and clearedBy when transitioning FROM LIBERADO", async () => {
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue({
      status: "LIBERADO",
      clearedAt: new Date("2025-05-01T00:00:00Z"),
      clearedBy: ACTOR_ID,
    } as never);
    vi.mocked(prisma.returnToPlay.upsert).mockResolvedValue({
      ...RTP_ROW,
      status: "AFASTADO",
      clearedAt: null,
      clearedBy: null,
    } as never);

    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
    });

    const upsertCall = vi.mocked(prisma.returnToPlay.upsert).mock.calls[0]?.[0];
    expect(upsertCall?.update?.clearedAt).toBeNull();
    expect(upsertCall?.update?.clearedBy).toBeNull();
  });

  it("does not touch clearedAt/clearedBy when staying non-LIBERADO", async () => {
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue({
      status: "RETORNO_PROGRESSIVO",
      clearedAt: null,
      clearedBy: null,
    } as never);
    vi.mocked(prisma.returnToPlay.upsert).mockResolvedValue({
      ...RTP_ROW,
      status: "AFASTADO",
    } as never);

    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
    });

    const upsertCall = vi.mocked(prisma.returnToPlay.upsert).mock.calls[0]?.[0];
    expect(upsertCall?.update?.clearedAt).toBeNull();
    expect(upsertCall?.update?.clearedBy).toBeNull();
  });

  it("writes RTP_STATUS_CHANGED audit log entry", async () => {
    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "RETORNO_PROGRESSIVO",
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "RTP_STATUS_CHANGED",
          actorId: ACTOR_ID,
          entityId: ATHLETE_ID,
          entityType: "Athlete",
        }),
      }),
    );
  });

  it("includes previousStatus and newStatus in audit metadata", async () => {
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue({
      status: "AFASTADO",
      clearedAt: null,
      clearedBy: null,
    } as never);

    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "RETORNO_PROGRESSIVO",
    });

    const auditCall = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0];
    expect(auditCall?.data.metadata).toMatchObject({
      previousStatus: "AFASTADO",
      newStatus: "RETORNO_PROGRESSIVO",
    });
  });

  it("records previousStatus: null in audit log when no prior record exists", async () => {
    vi.mocked(prisma.returnToPlay.findUnique).mockResolvedValue(null);

    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
    });

    const auditCall = vi.mocked(prisma.auditLog.create).mock.calls[0]?.[0];
    expect(auditCall?.data.metadata).toMatchObject({ previousStatus: null });
  });

  it("returns the full RTP payload with athleteId and status", async () => {
    vi.mocked(prisma.returnToPlay.upsert).mockResolvedValue({
      ...RTP_ROW,
      status: "RETORNO_PROGRESSIVO",
    } as never);

    const result = await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "RETORNO_PROGRESSIVO",
    });

    expect(result.athleteId).toBe(ATHLETE_ID);
    expect(result.status).toBe("RETORNO_PROGRESSIVO");
  });

  it("returns clearedAt as ISO string when set", async () => {
    vi.mocked(prisma.returnToPlay.upsert).mockResolvedValue({
      ...RTP_ROW,
      status: "LIBERADO",
      clearedAt: NOW,
      clearedBy: ACTOR_ID,
    } as never);

    const result = await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "LIBERADO",
    });

    expect(result.clearedAt).toBe(NOW.toISOString());
    expect(result.clearedBy).toBe(ACTOR_ID);
  });

  it("calls $transaction (withTenantSchema)", async () => {
    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("only passes medicalRecordId to update when explicitly provided", async () => {
    vi.mocked(prisma.medicalRecord.findUnique).mockResolvedValue({
      id: RECORD_ID,
    } as never);
    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
      medicalRecordId: RECORD_ID,
    });
    const upsertCall = vi.mocked(prisma.returnToPlay.upsert).mock.calls[0]?.[0];
    expect(upsertCall?.update).toHaveProperty("medicalRecordId", RECORD_ID);
  });

  it("does NOT include medicalRecordId in update when absent from input", async () => {
    await upsertRtp(prisma, CLUB_ID, ACTOR_ID, ATHLETE_ID, {
      status: "AFASTADO",
    });
    const upsertCall = vi.mocked(prisma.returnToPlay.upsert).mock.calls[0]?.[0];
    expect(upsertCall?.update).not.toHaveProperty("medicalRecordId");
  });
});
