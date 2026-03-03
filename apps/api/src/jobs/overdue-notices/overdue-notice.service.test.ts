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

vi.mock("../../modules/messages/messages.service.js", () => ({
  hasRecentMessage: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../modules/templates/templates.service.js", () => ({
  buildRenderedMessage: vi
    .fn()
    .mockResolvedValue(
      "Olá Alice! Sua mensalidade de R$ 99,00 está em atraso.",
    ),
}));

vi.mock("../../modules/whatsapp/whatsapp.service.js", () => ({
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

import { sendOverdueNoticesForClub } from "./overdue-notice.service.js";
import { hasRecentMessage } from "../../modules/messages/messages.service.js";
import { buildRenderedMessage } from "../../modules/templates/templates.service.js";
import { sendWhatsAppMessage } from "../../modules/whatsapp/whatsapp.service.js";
import { checkAndConsumeWhatsAppRateLimit } from "../../lib/whatsapp-rate-limit.js";

function buildCharge(
  overrides: {
    id?: string;
    memberId?: string;
    amountCents?: number;
    status?: "PENDING" | "OVERDUE";
    memberStatus?: string;
    memberName?: string;
    phone?: Uint8Array;
    gatewayMeta?: Record<string, unknown> | null;
  } = {},
) {
  return {
    id: overrides.id ?? "charge-001",
    memberId: overrides.memberId ?? "member-001",
    amountCents: overrides.amountCents ?? 9900,
    dueDate: new Date("2025-03-01T23:59:59.999Z"),
    status: overrides.status ?? "PENDING",
    gatewayMeta:
      overrides.gatewayMeta !== undefined
        ? overrides.gatewayMeta
        : { qrCodeBase64: "base64==", pixCopyPaste: "00020126..." },
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
const TARGET_START = new Date("2025-03-01T00:00:00.000Z");
const TARGET_END = new Date("2025-03-01T23:59:59.999Z");

describe("sendOverdueNoticesForClub", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(hasRecentMessage).mockResolvedValue(false);
    vi.mocked(buildRenderedMessage).mockResolvedValue(
      "Olá Alice! Sua mensalidade de R$ 99,00 está em atraso.",
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

  it("ON-1: returns all-zero result when no charges exist in the target window", async () => {
    const tx = buildMockTx({ chargeFindMany: [] });
    setMockTx(tx);

    const result = await sendOverdueNoticesForClub(
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

  it("ON-2: sends notices to all 3 active PENDING charges", async () => {
    const charges = [
      buildCharge({
        id: "c1",
        memberId: "m1",
        memberName: "Alice",
        status: "PENDING",
      }),
      buildCharge({
        id: "c2",
        memberId: "m2",
        memberName: "Bob",
        status: "PENDING",
      }),
      buildCharge({
        id: "c3",
        memberId: "m3",
        memberName: "Carol",
        status: "PENDING",
      }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    const result = await sendOverdueNoticesForClub(
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

  it("ON-3: sends notices to all 3 active OVERDUE charges", async () => {
    const charges = [
      buildCharge({
        id: "c1",
        memberId: "m1",
        memberName: "Alice",
        status: "OVERDUE",
      }),
      buildCharge({
        id: "c2",
        memberId: "m2",
        memberName: "Bob",
        status: "OVERDUE",
      }),
      buildCharge({
        id: "c3",
        memberId: "m3",
        memberName: "Carol",
        status: "OVERDUE",
      }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    const result = await sendOverdueNoticesForClub(
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

  it("ON-4: handles mixed PENDING and OVERDUE charges in the same batch", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1", status: "PENDING" }),
      buildCharge({ id: "c2", memberId: "m2", status: "OVERDUE" }),
      buildCharge({ id: "c3", memberId: "m3", status: "PENDING" }),
      buildCharge({ id: "c4", memberId: "m4", status: "OVERDUE" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    const result = await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(4);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(4);
  });

  it("ON-5: skips member that already received an overdue notice within the 20h window", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1" }),
      buildCharge({ id: "c2", memberId: "m2" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    vi.mocked(hasRecentMessage).mockImplementation(async (_p, _c, memberId) => {
      return memberId === "m1";
    });

    const result = await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it("ON-6: skips INACTIVE members as a safety guard", async () => {
    const charges = [
      buildCharge({ id: "c1", memberId: "m1", memberStatus: "INACTIVE" }),
      buildCharge({ id: "c2", memberId: "m2", memberStatus: "ACTIVE" }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    const result = await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(1);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it("ON-7: records rate-limited member in errors and increments rateLimited counter", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(checkAndConsumeWhatsAppRateLimit).mockResolvedValue({
      allowed: false,
      current: 30,
      limit: 30,
      retryAfterMs: 45_000,
    });

    const result = await sendOverdueNoticesForClub(
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

  it("ON-8: captures template render error and continues processing other charges", async () => {
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
      return "Olá Bob! Sua mensalidade está em atraso.";
    });

    const result = await sendOverdueNoticesForClub(
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

  it("ON-9: records FAILED send result in errors without incrementing sent counter", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(sendWhatsAppMessage).mockResolvedValue({
      messageId: "msg-001",
      status: "FAILED",
      failReason: "Z-API returned 503",
    });

    const result = await sendOverdueNoticesForClub(
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

  it("ON-10: re-throws when sendWhatsAppMessage propagates a decryptField error", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(sendWhatsAppMessage).mockRejectedValue(
      new Error("pgp_sym_decrypt returned no result"),
    );

    await expect(
      sendOverdueNoticesForClub(PRISMA_STUB, CLUB_ID, TARGET_START, TARGET_END),
    ).rejects.toThrow("pgp_sym_decrypt returned no result");
  });

  it("ON-11: correctly tracks mixed outcomes across multiple charges", async () => {
    const charges = [
      buildCharge({
        id: "c1",
        memberId: "m1",
        memberName: "Alice",
        status: "PENDING",
      }),
      buildCharge({
        id: "c2",
        memberId: "m2",
        memberName: "Bob",
        status: "OVERDUE",
      }),
      buildCharge({
        id: "c3",
        memberId: "m3",
        memberName: "Carol",
        status: "PENDING",
      }),
      buildCharge({
        id: "c4",
        memberId: "m4",
        memberName: "Dave",
        status: "OVERDUE",
      }),
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

    const result = await sendOverdueNoticesForClub(
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

  it("ON-12: uses OVERDUE_NOTICE template key when calling sendWhatsAppMessage", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      PRISMA_STUB,
      expect.objectContaining({ template: "overdue_notice" }),
      "system:job:overdue-notice",
    );
  });

  it("ON-13: uses system:job:overdue-notice as actorId for AuditLog traceability", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "system:job:overdue-notice",
    );
  });

  it("ON-14: queries charges with status IN [PENDING, OVERDUE] and correct date range", async () => {
    const tx = buildMockTx({ chargeFindMany: [] });
    setMockTx(tx);

    await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(tx.charge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ["PENDING", "OVERDUE"] },
          dueDate: { gte: TARGET_START, lte: TARGET_END },
        },
      }),
    );
  });

  it('ON-15: FAILED send with undefined failReason records "Unknown send failure"', async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(sendWhatsAppMessage).mockResolvedValue({
      messageId: "msg-001",
      status: "FAILED",
      failReason: undefined,
    });

    const result = await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.errors[0]!.reason).toBe("Unknown send failure");
  });

  it("passes gatewayMeta to buildRenderedMessage for Pix code interpolation", async () => {
    const meta = { qrCodeBase64: "abc==", pixCopyPaste: "00020126..." };
    const charge = buildCharge({ gatewayMeta: meta });
    const tx = buildMockTx({ chargeFindMany: [charge] });
    setMockTx(tx);

    await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(buildRenderedMessage).toHaveBeenCalledWith(
      PRISMA_STUB,
      CLUB_ID,
      "overdue_notice",
      expect.objectContaining({ gatewayMeta: meta }),
      "Alice Costa",
    );
  });

  it("handles non-Error throws from buildRenderedMessage with fallback reason", async () => {
    const tx = buildMockTx({ chargeFindMany: [buildCharge()] });
    setMockTx(tx);

    vi.mocked(buildRenderedMessage).mockRejectedValue("string error");

    const result = await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.errors[0]!.reason).toBe("Template render error");
  });

  it("skips OVERDUE member with status INACTIVE", async () => {
    const charges = [
      buildCharge({
        id: "c1",
        memberId: "m1",
        status: "OVERDUE",
        memberStatus: "INACTIVE",
      }),
    ];
    const tx = buildMockTx({ chargeFindMany: charges });
    setMockTx(tx);

    const result = await sendOverdueNoticesForClub(
      PRISMA_STUB,
      CLUB_ID,
      TARGET_START,
      TARGET_END,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("returns correct clubId in result", async () => {
    const tx = buildMockTx({ chargeFindMany: [] });
    setMockTx(tx);

    const result = await sendOverdueNoticesForClub(
      PRISMA_STUB,
      "some-other-club",
      TARGET_START,
      TARGET_END,
    );

    expect(result.clubId).toBe("some-other-club");
  });
});
