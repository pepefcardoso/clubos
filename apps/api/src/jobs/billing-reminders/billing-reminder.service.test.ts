import { describe, it, expect, vi, beforeEach } from "vitest";

let _mockTx: ReturnType<typeof buildMockTx>;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_mockTx),
  ),
}));

vi.mock("../messages/messages.service.js", () => ({
  hasRecentMessage: vi.fn().mockResolvedValue(false),
}));

vi.mock("../templates/templates.service.js", () => ({
  buildRenderedMessage: vi
    .fn()
    .mockResolvedValue(
      "Olá Alice! Sua mensalidade de R$ 99,00 vence em 3 dias.",
    ),
}));

vi.mock("../whatsapp/whatsapp.service.js", () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({
    messageId: "msg-001",
    status: "SENT",
    providerMessageId: "zap-001",
  }),
}));

vi.mock("../../lib/whatsapp-rate-limit.js", () => ({
  checkAndConsumeWhatsAppRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    current: 1,
    limit: 30,
    retryAfterMs: 0,
  }),
}));

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn().mockReturnValue({}),
}));

import {
  sendDailyRemindersForClub,
  getTargetDayRange,
} from "./billing-reminder.service.js";
import { hasRecentMessage } from "../../modules/messages/messages.service.js";
import { buildRenderedMessage } from "../../modules/templates/templates.service.js";
import { sendWhatsAppMessage } from "../../modules/whatsapp/whatsapp.service.js";
import { checkAndConsumeWhatsAppRateLimit } from "../../lib/whatsapp-rate-limit.js";

function buildCharge(
  overrides: {
    id?: string;
    memberId?: string;
    amountCents?: number;
    status?: string;
    memberStatus?: string;
    memberName?: string;
    phone?: Uint8Array;
  } = {},
) {
  return {
    id: overrides.id ?? "charge-001",
    memberId: overrides.memberId ?? "member-001",
    amountCents: overrides.amountCents ?? 9900,
    dueDate: new Date("2025-03-04T23:59:59.999Z"),
    status: overrides.status ?? "PENDING",
    gatewayMeta: { qrCodeBase64: "base64==", pixCopyPaste: "00020126..." },
    member: {
      id: overrides.memberId ?? "member-001",
      name: overrides.memberName ?? "Alice Costa",
      phone: overrides.phone ?? new Uint8Array([1, 2, 3]),
      status: overrides.memberStatus ?? "ACTIVE",
    },
  };
}

function buildMockTx(
  overrides: {
    chargeFindMany?: ReturnType<typeof buildCharge>[];
  } = {},
) {
  return {
    charge: {
      findMany: vi.fn().mockResolvedValue(overrides.chargeFindMany ?? []),
    },
  };
}

function setMockTx(tx: ReturnType<typeof buildMockTx>) {
  _mockTx = tx;
}

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-test-001";
const TARGET_START = new Date("2025-03-04T00:00:00.000Z");
const TARGET_END = new Date("2025-03-04T23:59:59.999Z");

describe("getTargetDayRange", () => {
  it("BR-10: returns correct UTC day boundaries 3 days from now", () => {
    const now = new Date("2025-03-01T12:00:00.000Z");
    const [start, end] = getTargetDayRange(3, now);

    expect(start).toEqual(new Date("2025-03-04T00:00:00.000Z"));
    expect(end).toEqual(new Date("2025-03-04T23:59:59.999Z"));
  });

  it("BR-11: handles midnight UTC edge without day drift", () => {
    const now = new Date("2025-03-01T00:00:00.000Z");
    const [start, end] = getTargetDayRange(3, now);

    expect(start).toEqual(new Date("2025-03-04T00:00:00.000Z"));
    expect(end).toEqual(new Date("2025-03-04T23:59:59.999Z"));
  });

  it("correctly rolls over month boundary (March 30 + 3 = April 2)", () => {
    const now = new Date("2025-03-30T00:00:00.000Z");
    const [start] = getTargetDayRange(3, now);

    expect(start.getUTCDate()).toBe(2);
    expect(start.getUTCMonth()).toBe(3);
    expect(start.getUTCFullYear()).toBe(2025);
  });

  it("correctly handles year boundary (Dec 30 + 3 = Jan 2)", () => {
    const now = new Date("2024-12-30T00:00:00.000Z");
    const [start] = getTargetDayRange(3, now);

    expect(start.getUTCDate()).toBe(2);
    expect(start.getUTCMonth()).toBe(0);
    expect(start.getUTCFullYear()).toBe(2025);
  });

  it("end boundary always ends at 23:59:59.999 UTC", () => {
    const now = new Date("2025-06-15T18:30:00.000Z");
    const [, end] = getTargetDayRange(3, now);

    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
    expect(end.getUTCSeconds()).toBe(59);
    expect(end.getUTCMilliseconds()).toBe(999);
  });
});

describe("sendDailyRemindersForClub", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(hasRecentMessage).mockResolvedValue(false);
    vi.mocked(buildRenderedMessage).mockResolvedValue(
      "Olá Alice! Sua mensalidade de R$ 99,00 vence em 3 dias.",
    );
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({
      messageId: "msg-001",
      status: "SENT",
      providerMessageId: "zap-001",
    });
    vi.mocked(checkAndConsumeWhatsAppRateLimit).mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 30,
      retryAfterMs: 0,
    });
  });

  it("BR-1: returns all-zero result when no charges exist in the target window", async () => {
    const tx = buildMockTx({ chargeFindMany: [] });
    setMockTx(tx);

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.rateLimited).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.clubId).toBe(CLUB_ID);
  });

  it("BR-2: sends reminders to all 3 active members with PENDING charges", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1", memberName: "Alice" }),
      buildCharge({ id: "c2", memberId: "m2", memberName: "Bob" }),
      buildCharge({ id: "c3", memberId: "m3", memberName: "Carol" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(3);
  });

  it("BR-3: skips member that already received a reminder within the 20h window", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1" }),
      buildCharge({ id: "c2", memberId: "m2" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    vi.mocked(hasRecentMessage).mockImplementation(async (_p, _c, memberId) => {
      return memberId === "m1";
    });

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it("BR-4: records rate-limited member in errors and increments rateLimited counter", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(checkAndConsumeWhatsAppRateLimit).mockResolvedValue({
      allowed: false,
      current: 30,
      limit: 30,
      retryAfterMs: 45_000,
    });

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(0);
    expect(result.rateLimited).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      chargeId: "charge-001",
      memberId: "member-001",
    });
    expect(result.errors[0]!.reason).toContain("Rate limited");
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("BR-5: captures template render error and continues processing other charges", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1", memberName: "Alice" }),
      buildCharge({ id: "c2", memberId: "m2", memberName: "Bob" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    let callCount = 0;
    vi.mocked(buildRenderedMessage).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Template key not found");
      return "Olá Bob!";
    });

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      chargeId: "c1",
      memberId: "m1",
      reason: "Template key not found",
    });
  });

  it("BR-6: records FAILED send result in errors without incrementing sent counter", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(sendWhatsAppMessage).mockResolvedValue({
      messageId: "msg-001",
      status: "FAILED",
      failReason: "Z-API returned 503",
    });

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      chargeId: "charge-001",
      memberId: "member-001",
      reason: "Z-API returned 503",
    });
  });

  it("BR-7: skips INACTIVE members as a safety guard", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1", memberStatus: "INACTIVE" }),
      buildCharge({ id: "c2", memberId: "m2", memberStatus: "ACTIVE" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it("BR-8: re-throws when sendWhatsAppMessage propagates a decryptField error", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(sendWhatsAppMessage).mockRejectedValue(
      new Error("pgp_sym_decrypt returned no result"),
    );

    await expect(
      sendDailyRemindersForClub(PRISMA_STUB, CLUB_ID, TARGET_START, TARGET_END),
    ).rejects.toThrow("pgp_sym_decrypt returned no result");
  });

  it("BR-9: correctly tracks mixed outcomes across multiple charges", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1", memberName: "Alice" }),
      buildCharge({ id: "c2", memberId: "m2", memberName: "Bob" }),
      buildCharge({ id: "c3", memberId: "m3", memberName: "Carol" }),
      buildCharge({ id: "c4", memberId: "m4", memberName: "Dave" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    vi.mocked(hasRecentMessage).mockImplementation(async (_p, _c, memberId) => {
      return memberId === "m2";
    });

    let rateCallCount = 0;
    vi.mocked(checkAndConsumeWhatsAppRateLimit).mockImplementation(async () => {
      rateCallCount++;
      
      if (rateCallCount === 3) {
        return { allowed: false, current: 30, limit: 30, retryAfterMs: 30_000 };
      }
      return {
        allowed: true,
        current: rateCallCount,
        limit: 30,
        retryAfterMs: 0,
      };
    });

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.rateLimited).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.memberId).toBe("m4");
  });

  it("passes CHARGE_REMINDER_D3 template key to sendWhatsAppMessage", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      PRISMA_STUB,
      expect.objectContaining({ template: "charge_reminder_d3" }),
      "system:job:d3-reminder",
    );
  });

  it("uses system:job:d3-reminder as actorId for AuditLog traceability", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "system:job:d3-reminder",
    );
  });

  it("queries charges with status PENDING and correct date range", async () => {
    const tx = buildMockTx({ chargeFindMany: [] });
    setMockTx(tx);

    await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(tx.charge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "PENDING",
          dueDate: { gte: TARGET_START, lte: TARGET_END },
        },
      }),
    );
  });

  it("passes gatewayMeta to buildRenderedMessage for Pix code interpolation", async () => {
    const meta = { qrCodeBase64: "abc==", pixCopyPaste: "00020126..." };
    const charge = buildCharge();
    charge.gatewayMeta = meta;
    const tx = buildMockTx({ chargeFindMany: [charge] });
    setMockTx(tx);

    await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(buildRenderedMessage).toHaveBeenCalledWith(
      PRISMA_STUB,
      CLUB_ID,
      "charge_reminder_d3",
      expect.objectContaining({ gatewayMeta: meta }),
      "Alice Costa",
    );
  });

  it("handles non-Error throws from buildRenderedMessage with fallback reason", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(buildRenderedMessage).mockRejectedValue("string error");

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.errors[0]!.reason).toBe("Template render error");
  });

  it('handles FAILED send with undefined failReason as "Unknown send failure"', async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(sendWhatsAppMessage).mockResolvedValue({
      messageId: "msg-001",
      status: "FAILED",
      failReason: undefined,
    });

    const result = await sendDailyRemindersForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.errors[0]!.reason).toBe("Unknown send failure");
  });
});
