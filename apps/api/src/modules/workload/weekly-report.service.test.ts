import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  buildWeeklyReportMessage,
  gatherAthleteStats,
  buildIdempotencyKey,
  sendWeeklyAthleteReports,
  type AthleteWeeklyStats,
} from "./weekly-report.service.js";

vi.mock("../../lib/crypto.js", () => ({
  getEncryptionKey: vi.fn().mockReturnValue("test-encryption-key-32chars-xx!!"),
}));

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn().mockReturnValue(mockRedis),
}));

const mockSendWhatsAppMessage = vi.fn();
vi.mock("../whatsapp/whatsapp.service.js", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

function makePrisma(): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
    message: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";
const WEEK_KEY = "2025-W24";
const TRIGGERED_AT = "2025-06-09T08:00:00.000Z";

function makeAthleteStats(
  overrides: Partial<AthleteWeeklyStats> = {},
): AthleteWeeklyStats {
  return {
    athleteId: "ath_001",
    athleteName: "Carlos Eduardo",
    sessionCount: 4,
    totalAu: 1680,
    acwrRatio: 1.15,
    riskZone: "optimal",
    guardianMemberId: "member_001",
    encryptedGuardianPhone: Buffer.from("encrypted") as unknown as Uint8Array,
    ...overrides,
  };
}

describe("buildWeeklyReportMessage()", () => {
  it("includes the athlete name", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ athleteName: "João Silva" }),
      WEEK_KEY,
    );
    expect(msg).toContain("João Silva");
  });

  it("includes the week key", () => {
    const msg = buildWeeklyReportMessage(makeAthleteStats(), WEEK_KEY);
    expect(msg).toContain("2025-W24");
  });

  it("includes sessionCount", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ sessionCount: 5 }),
      WEEK_KEY,
    );
    expect(msg).toContain("5");
  });

  it("includes totalAu", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ totalAu: 2100 }),
      WEEK_KEY,
    );
    expect(msg).toContain("2100");
  });

  it("uses 🟢 for optimal risk zone", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ riskZone: "optimal" }),
      WEEK_KEY,
    );
    expect(msg).toContain("🟢");
  });

  it("uses 🟡 for high risk zone", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ riskZone: "high" }),
      WEEK_KEY,
    );
    expect(msg).toContain("🟡");
  });

  it("uses 🔴 for very_high risk zone", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ riskZone: "very_high" }),
      WEEK_KEY,
    );
    expect(msg).toContain("🔴");
  });

  it("uses 🔵 for low risk zone", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ riskZone: "low" }),
      WEEK_KEY,
    );
    expect(msg).toContain("🔵");
  });

  it("uses ⚪ for null risk zone (insufficient data)", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ riskZone: null }),
      WEEK_KEY,
    );
    expect(msg).toContain("⚪");
    expect(msg).toContain("dados insuficientes");
  });

  it("uses ⚪ for insufficient_data risk zone", () => {
    const msg = buildWeeklyReportMessage(
      makeAthleteStats({ riskZone: "insufficient_data" }),
      WEEK_KEY,
    );
    expect(msg).toContain("⚪");
  });

  it("returns a string (not null/undefined)", () => {
    const msg = buildWeeklyReportMessage(makeAthleteStats(), WEEK_KEY);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe("buildIdempotencyKey()", () => {
  it("returns expected format weekly-report:{clubId}:{athleteId}:{weekKey}", () => {
    const key = buildIdempotencyKey("club-abc", "ath_001", "2025-W24");
    expect(key).toBe("weekly-report:club-abc:ath_001:2025-W24");
  });

  it("different athleteIds produce different keys", () => {
    const k1 = buildIdempotencyKey("club-abc", "ath_001", "2025-W24");
    const k2 = buildIdempotencyKey("club-abc", "ath_002", "2025-W24");
    expect(k1).not.toBe(k2);
  });

  it("different weekKeys produce different keys", () => {
    const k1 = buildIdempotencyKey("club-abc", "ath_001", "2025-W24");
    const k2 = buildIdempotencyKey("club-abc", "ath_001", "2025-W25");
    expect(k1).not.toBe(k2);
  });

  it("different clubIds produce different keys", () => {
    const k1 = buildIdempotencyKey("club-aaa", "ath_001", "2025-W24");
    const k2 = buildIdempotencyKey("club-bbb", "ath_001", "2025-W24");
    expect(k1).not.toBe(k2);
  });
});

describe("gatherAthleteStats()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("returns empty array when no active athletes found", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await gatherAthleteStats(
      prisma,
      CLUB_ID,
      new Date("2025-06-02"),
      new Date("2025-06-09"),
    );

    expect(result).toHaveLength(0);
  });

  it("maps raw DB row to AthleteWeeklyStats shape", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos Eduardo",
        session_count: 4,
        total_au: 1680,
        acwr_ratio: "1.15",
        risk_zone: "optimal",
        guardian_member_id: "member_001",
        encrypted_guardian_phone: Buffer.from("encrypted"),
      },
    ]);

    const result = await gatherAthleteStats(
      prisma,
      CLUB_ID,
      new Date("2025-06-02"),
      new Date("2025-06-09"),
    );

    expect(result).toHaveLength(1);
    const athlete = result[0]!;
    expect(athlete.athleteId).toBe("ath_001");
    expect(athlete.athleteName).toBe("Carlos Eduardo");
    expect(athlete.sessionCount).toBe(4);
    expect(athlete.totalAu).toBe(1680);
    expect(athlete.acwrRatio).toBe(1.15);
    expect(athlete.riskZone).toBe("optimal");
    expect(athlete.guardianMemberId).toBe("member_001");
    expect(athlete.encryptedGuardianPhone).toEqual(Buffer.from("encrypted"));
  });

  it("maps NUMERIC acwr_ratio string to JS number", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "a",
        athleteName: "B",
        session_count: 1,
        total_au: 100,
        acwr_ratio: "0.95",
        risk_zone: "low",
        encrypted_guardian_phone: null,
        guardian_member_id: null,
      },
    ]);

    const result = await gatherAthleteStats(
      prisma,
      CLUB_ID,
      new Date("2025-06-02"),
      new Date("2025-06-09"),
    );

    expect(typeof result[0]!.acwrRatio).toBe("number");
    expect(result[0]!.acwrRatio).toBe(0.95);
  });

  it("returns acwrRatio: null when raw value is null", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "a",
        athleteName: "B",
        session_count: 1,
        total_au: 100,
        acwr_ratio: null,
        risk_zone: null,
        encrypted_guardian_phone: null,
        guardian_member_id: null,
      },
    ]);

    const result = await gatherAthleteStats(
      prisma,
      CLUB_ID,
      new Date("2025-06-02"),
      new Date("2025-06-09"),
    );

    expect(result[0]!.acwrRatio).toBeNull();
    expect(result[0]!.riskZone).toBeNull();
  });

  it("returns null values for guardian fields when no matching member found", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "a",
        athleteName: "B",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        guardian_member_id: null,
        encrypted_guardian_phone: null,
      },
    ]);

    const result = await gatherAthleteStats(
      prisma,
      CLUB_ID,
      new Date("2025-06-02"),
      new Date("2025-06-09"),
    );

    expect(result[0]!.guardianMemberId).toBeNull();
    expect(result[0]!.encryptedGuardianPhone).toBeNull();
  });

  it("calls withTenantSchema ($transaction) once", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    await gatherAthleteStats(
      prisma,
      CLUB_ID,
      new Date("2025-06-02"),
      new Date("2025-06-09"),
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("calls $executeRawUnsafe with the correct tenant schema name", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    await gatherAthleteStats(
      prisma,
      CLUB_ID,
      new Date("2025-06-02"),
      new Date("2025-06-09"),
    );

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`clube_${CLUB_ID}`),
    );
  });

  it("re-throws database errors from $queryRaw", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error("relation does not exist"),
    );

    await expect(
      gatherAthleteStats(
        prisma,
        CLUB_ID,
        new Date("2025-06-02"),
        new Date("2025-06-09"),
      ),
    ).rejects.toThrow("relation does not exist");
  });
});

describe("sendWeeklyAthleteReports()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "SENT",
      messageId: "msg_123",
    });
  });

  it("returns clubId in the result", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.clubId).toBe(CLUB_ID);
  });

  it("returns weekKey in the result", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.weekKey).toBe(WEEK_KEY);
  });

  it("returns a non-negative durationMs", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns athletesProcessed: 0 when no athletes exist", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.athletesProcessed).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("skips athletes with no guardian phone", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Sem Responsável",
        session_count: 4,
        total_au: 1200,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        encrypted_guardian_phone: null,
        guardian_member_id: null,
      },
    ]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("skips athletes with 0 sessions in the window", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Inativo",
        session_count: 0,
        total_au: 0,
        acwr_ratio: null,
        risk_zone: null,
        encrypted_guardian_phone: Buffer.from("+5511999990001"),
        guardian_member_id: "member_001",
      },
    ]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("skips athletes whose idempotency key already exists in Redis", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.1",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511999990001"),
        guardian_member_id: "member_001",
      },
    ]);

    mockRedis.get.mockResolvedValue("1");

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("sends message and increments sent counter on success", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 4,
        total_au: 1680,
        acwr_ratio: "1.15",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511999990001"),
        guardian_member_id: "member_001",
      },
    ]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledOnce();
  });

  it("writes Redis idempotency key with 7-day TTL after successful send", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511999990001"),
        guardian_member_id: "member_001",
      },
    ]);

    await sendWeeklyAthleteReports(prisma, CLUB_ID, WEEK_KEY, TRIGGERED_AT);

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("weekly-report:"),
      "1",
      "EX",
      7 * 24 * 60 * 60,
    );
  });

  it("writes WEEKLY_ATHLETE_REPORT_SENT audit log entry after successful send", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511999990001"),
        guardian_member_id: "member_001",
      },
    ]);

    await sendWeeklyAthleteReports(prisma, CLUB_ID, WEEK_KEY, TRIGGERED_AT);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "WEEKLY_ATHLETE_REPORT_SENT",
          entityId: "ath_001",
          entityType: "Athlete",
          actorId: "system:cron",
          metadata: expect.objectContaining({
            weekKey: WEEK_KEY,
            sessionCount: 3,
            totalAu: 900,
          }),
        }),
      }),
    );
  });

  it("counts failed when WhatsApp send throws", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511999990001"),
        guardian_member_id: "member_001",
      },
    ]);
    mockSendWhatsAppMessage.mockRejectedValue(
      new Error("WhatsApp unavailable"),
    );

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
  });

  it("does not abort processing other athletes when one fails", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511999990001"),
        guardian_member_id: "member_001",
      },
      {
        athleteId: "ath_002",
        athleteName: "Maria",
        session_count: 5,
        total_au: 1500,
        acwr_ratio: "1.2",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511999990002"),
        guardian_member_id: "member_002",
      },
    ]);

    mockSendWhatsAppMessage
      .mockRejectedValueOnce(new Error("send failed"))
      .mockResolvedValueOnce({ status: "SENT", messageId: "msg_123" });

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.athletesProcessed).toBe(2);
  });

  it("sent + skipped + failed equals athletesProcessed", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        encrypted_guardian_phone: Buffer.from("+5511111"),
        guardian_member_id: "member_001",
      },
      {
        athleteId: "ath_002",
        athleteName: "Maria",
        session_count: 0,
        total_au: 0,
        acwr_ratio: null,
        risk_zone: null,
        encrypted_guardian_phone: Buffer.from("+5522222"),
        guardian_member_id: "member_002",
      },
      {
        athleteId: "ath_003",
        athleteName: "Pedro",
        session_count: 4,
        total_au: 1200,
        acwr_ratio: "1.1",
        risk_zone: "optimal",
        encrypted_guardian_phone: null,
        guardian_member_id: null,
      },
    ]);

    const result = await sendWeeklyAthleteReports(
      prisma,
      CLUB_ID,
      WEEK_KEY,
      TRIGGERED_AT,
    );

    expect(result.sent + result.skipped + result.failed).toBe(
      result.athletesProcessed,
    );
  });

  it("does not call sendWhatsAppMessage when no athletes have guardian phones", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        athleteId: "ath_001",
        athleteName: "Carlos",
        session_count: 3,
        total_au: 900,
        acwr_ratio: "1.0",
        risk_zone: "optimal",
        encrypted_guardian_phone: null,
        guardian_member_id: null,
      },
    ]);

    await sendWeeklyAthleteReports(prisma, CLUB_ID, WEEK_KEY, TRIGGERED_AT);

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
