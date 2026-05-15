import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import {
  generateAndSendCurationReport,
  isActiveSubscription,
  generateCurationPdf,
} from "./scout-curation-report.service.js";
import { appendCommunicationLog } from "../../modules/scoutlink/communication/communication-log.service.js";
import { getResendClient } from "../../lib/email.js";

vi.mock("../../modules/scoutlink/communication/communication-log.service.js");
vi.mock("../../lib/email.js");

const mockAppendCommunicationLog = appendCommunicationLog as MockedFunction<
  typeof appendCommunicationLog
>;

const mockResendSend = vi.fn();
const mockGetResendClient = getResendClient as MockedFunction<
  typeof getResendClient
>;

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    scoutProfile: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
    ...overrides,
  } as unknown as import("../../../generated/prisma/index.js").PrismaClient;
}

const baseScout = {
  email: "scout@example.com",
  name: "Ana Scout",
  targetPositions: ["ATACANTE"],
  subscriptionStatus: "ACTIVE",
  subscriptionExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
};

const baseAthlete = {
  id: "showcase-1",
  athleteId: "athlete-1",
  clubId: "club-1",
  tier: "PREMIUM",
  snapshot: {
    name: "João Silva",
    position: "ATACANTE",
    ageYears: 17,
    rtpStatus: "FIT",
    acwrTrend: [{ acwrRatio: 1.2, riskZone: "OPTIMAL" }],
    evaluationScores: {
      technique: 8,
      tactical: 7,
      physical: 9,
      mental: 7,
      attitude: 8,
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetResendClient.mockReturnValue({
    emails: { send: mockResendSend },
  } as unknown as ReturnType<typeof getResendClient>);
  mockResendSend.mockResolvedValue({ error: null });
  mockAppendCommunicationLog.mockResolvedValue(undefined);
});

describe("isActiveSubscription", () => {
  it("returns true for ACTIVE with future expiry", () => {
    expect(isActiveSubscription("ACTIVE", new Date(Date.now() + 1000))).toBe(
      true,
    );
  });

  it("returns false for ACTIVE with past expiry", () => {
    expect(isActiveSubscription("ACTIVE", new Date(Date.now() - 1000))).toBe(
      false,
    );
  });

  it("returns false for INACTIVE", () => {
    expect(isActiveSubscription("INACTIVE", new Date(Date.now() + 1000))).toBe(
      false,
    );
  });

  it("returns false when expiresAt is null", () => {
    expect(isActiveSubscription("ACTIVE", null)).toBe(false);
  });
});

describe("generateAndSendCurationReport", () => {
  it("skips when scout not found", async () => {
    const prisma = makePrisma();
    (
      prisma.scoutProfile.findUnique as MockedFunction<
        typeof prisma.scoutProfile.findUnique
      >
    ).mockResolvedValue(null);

    const result = await generateAndSendCurationReport(
      prisma,
      "scout-1",
      "2025-03",
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("scout not found");
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockAppendCommunicationLog).not.toHaveBeenCalled();
  });

  it("skips when subscription is lapsed", async () => {
    const prisma = makePrisma();
    (
      prisma.scoutProfile.findUnique as MockedFunction<
        typeof prisma.scoutProfile.findUnique
      >
    ).mockResolvedValue({
      ...baseScout,
      subscriptionExpiresAt: new Date(Date.now() - 1000),
    } as any);

    const result = await generateAndSendCurationReport(
      prisma,
      "scout-1",
      "2025-03",
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("subscription lapsed");
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockAppendCommunicationLog).not.toHaveBeenCalled();
  });

  it("skips when scout has no email", async () => {
    const prisma = makePrisma();
    (
      prisma.scoutProfile.findUnique as MockedFunction<
        typeof prisma.scoutProfile.findUnique
      >
    ).mockResolvedValue({
      ...baseScout,
      email: null,
    } as any);

    const result = await generateAndSendCurationReport(
      prisma,
      "scout-1",
      "2025-03",
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no email address");
  });

  it("skips when no matching athletes", async () => {
    const prisma = makePrisma();
    (
      prisma.scoutProfile.findUnique as MockedFunction<
        typeof prisma.scoutProfile.findUnique
      >
    ).mockResolvedValue(baseScout as any);
    (
      prisma.$queryRaw as MockedFunction<typeof prisma.$queryRaw>
    ).mockResolvedValue([]);

    const result = await generateAndSendCurationReport(
      prisma,
      "scout-1",
      "2025-03",
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no matching athletes");
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("happy path: sends email and appends communication log", async () => {
    const prisma = makePrisma();
    (
      prisma.scoutProfile.findUnique as MockedFunction<
        typeof prisma.scoutProfile.findUnique
      >
    ).mockResolvedValue(baseScout as any);
    (
      prisma.$queryRaw as MockedFunction<typeof prisma.$queryRaw>
    ).mockResolvedValue([baseAthlete]);

    const result = await generateAndSendCurationReport(
      prisma,
      "scout-1",
      "2025-03",
    );

    expect(result.skipped).toBe(false);
    expect(result.emailSent).toBe(true);
    expect(result.athleteCount).toBe(1);

    expect(mockResendSend).toHaveBeenCalledOnce();
    const sendCall = mockResendSend.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(sendCall["to"]).toBe("scout@example.com");
    expect(Array.isArray(sendCall["attachments"])).toBe(true);

    expect(mockAppendCommunicationLog).toHaveBeenCalledOnce();
    const logCall = mockAppendCommunicationLog.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(logCall["eventType"]).toBe("CURATION_REPORT_SENT");
    expect(logCall["targetId"]).toBe("scout-1");
    const meta = logCall["metadata"] as Record<string, unknown>;
    expect(meta).not.toHaveProperty("email");
    expect(meta).not.toHaveProperty("name");
    expect(meta["yearMonth"]).toBe("2025-03");
    expect(meta["athleteCount"]).toBe(1);
  });

  it("does not append communication log when Resend returns error", async () => {
    const prisma = makePrisma();
    (
      prisma.scoutProfile.findUnique as MockedFunction<
        typeof prisma.scoutProfile.findUnique
      >
    ).mockResolvedValue(baseScout as any);
    (
      prisma.$queryRaw as MockedFunction<typeof prisma.$queryRaw>
    ).mockResolvedValue([baseAthlete]);
    mockResendSend.mockResolvedValue({ error: { message: "rate limit" } });

    const result = await generateAndSendCurationReport(
      prisma,
      "scout-1",
      "2025-03",
    );

    expect(result.emailSent).toBe(false);
    expect(result.skipped).toBe(false);
    expect(mockAppendCommunicationLog).not.toHaveBeenCalled();
  });

  it("uses empty targetPositions when field is absent (no position filter)", async () => {
    const prisma = makePrisma();
    (
      prisma.scoutProfile.findUnique as MockedFunction<
        typeof prisma.scoutProfile.findUnique
      >
    )
      .mockResolvedValue({
        ...baseScout,
        targetPositions: null,
      } as any);
    (
      prisma.$queryRaw as MockedFunction<typeof prisma.$queryRaw>
    ).mockResolvedValue([baseAthlete]);

    const result = await generateAndSendCurationReport(
      prisma,
      "scout-1",
      "2025-03",
    );

    expect(result.skipped).toBe(false);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
});

describe("generateCurationPdf", () => {
  it("resolves a non-empty Buffer", async () => {
    const buffer = await generateCurationPdf(
      [baseAthlete],
      "Ana Scout",
      "2025-03",
    );
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("handles athletes with null snapshot fields gracefully", async () => {
    const sparse = {
      ...baseAthlete,
      snapshot: { name: "Sem Dados" },
    };
    await expect(
      generateCurationPdf([sparse], "Ana Scout", "2025-03"),
    ).resolves.toBeTruthy();
  });

  it("handles empty athlete list (skipped before this call in practice)", async () => {
    const buffer = await generateCurationPdf([], "Ana Scout", "2025-03");
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
