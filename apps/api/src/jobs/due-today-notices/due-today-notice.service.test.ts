import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendDueTodayNoticesForClub } from "./due-today-notice.service.js";

const mockHasRecentMessage = vi.fn();
const mockCountRecentFailed = vi.fn();
vi.mock("../../modules/messages/messages.service.js", () => ({
  hasRecentMessage: (...args: unknown[]) => mockHasRecentMessage(...args),
  countRecentFailedWhatsAppMessages: (...args: unknown[]) =>
    mockCountRecentFailed(...args),
}));

const mockBuildRenderedMessage = vi.fn();
vi.mock("../../modules/templates/templates.service.js", () => ({
  buildRenderedMessage: (...args: unknown[]) =>
    mockBuildRenderedMessage(...args),
}));

const mockSendWhatsAppMessage = vi.fn();
vi.mock("../../modules/whatsapp/whatsapp.service.js", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

const mockCheckAndConsumeWhatsAppRateLimit = vi.fn();
vi.mock("../../lib/whatsapp-rate-limit.js", () => ({
  checkAndConsumeWhatsAppRateLimit: (...args: unknown[]) =>
    mockCheckAndConsumeWhatsAppRateLimit(...args),
}));

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: () => ({}),
}));

const mockSendEmailFallback = vi.fn();
vi.mock("../../modules/email/email-fallback.service.js", () => ({
  sendEmailFallbackMessage: (...args: unknown[]) =>
    mockSendEmailFallback(...args),
}));

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) =>
      fn({}),
  ),
}));

function makeCharge(
  overrides: Partial<{
    memberId: string;
    status: string;
    memberStatus: string;
    memberEmail: string | null;
  }> = {},
) {
  return {
    id: "charge-1",
    memberId: overrides.memberId ?? "member-1",
    amountCents: 9900,
    dueDate: new Date("2025-04-13T03:00:00.000Z"),
    status: overrides.status ?? "PENDING",
    gatewayMeta: { pixCopyPaste: "00020126..." },
    member: {
      id: overrides.memberId ?? "member-1",
      name: "Maria Souza",
      phone: Buffer.from("encrypted"),
      email:
        overrides.memberEmail !== undefined
          ? overrides.memberEmail
          : "maria@example.com",
      status: overrides.memberStatus ?? "ACTIVE",
    },
  };
}

const MOCK_PRISMA = {} as never;
const DATE_START = new Date("2025-04-13T00:00:00.000Z");
const DATE_END = new Date("2025-04-13T23:59:59.999Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckAndConsumeWhatsAppRateLimit.mockResolvedValue({ allowed: true });
  mockBuildRenderedMessage.mockResolvedValue(
    "Olá, Maria! Sua mensalidade vence hoje.",
  );
  mockSendWhatsAppMessage.mockResolvedValue({ status: "SENT" });
  mockHasRecentMessage.mockResolvedValue(false);
  mockCountRecentFailed.mockResolvedValue(0);
});

import { withTenantSchema } from "../../lib/prisma.js";

describe("sendDueTodayNoticesForClub() — no charges", () => {
  it("returns all-zero result when no charges are due today (S-1)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([]);

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.rateLimited).toBe(0);
    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("initialises emailFallbacks to 0", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([]);

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
  });
});

describe("sendDueTodayNoticesForClub() — inactive member", () => {
  it("skips inactive members without attempting WA or email (S-2)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([
      makeCharge({ memberStatus: "INACTIVE" }),
    ]);

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.emailFallbacks).toBe(0);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });
});

describe("sendDueTodayNoticesForClub() — idempotency guard", () => {
  it("skips charge when hasRecentMessage returns true within 20h window (S-3)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockHasRecentMessage.mockResolvedValueOnce(true);

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

describe("sendDueTodayNoticesForClub() — rate limiting", () => {
  it("records error and increments rateLimited when rate check fails (S-4)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockCheckAndConsumeWhatsAppRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterMs: 30000,
    });

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.rateLimited).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("Rate limited");
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

describe("sendDueTodayNoticesForClub() — template render error", () => {
  it("records error per charge and continues processing next charge (S-5)", async () => {
    const charge1 = makeCharge({ memberId: "member-1" });
    const charge2 = makeCharge({ memberId: "member-2" });
    vi.mocked(withTenantSchema).mockResolvedValueOnce([charge1, charge2]);
    mockBuildRenderedMessage
      .mockRejectedValueOnce(new Error("Missing template variable"))
      .mockResolvedValueOnce("Olá, member-2! ...");

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toBe("Missing template variable");
    expect(result.sent).toBe(1);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledOnce();
  });
});

describe("sendDueTodayNoticesForClub() — happy path", () => {
  it("sends WhatsApp and increments sent when WA succeeds (S-6)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.sent).toBe(1);
    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("uses CHARGE_REMINDER_D0 as the template key", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);

    await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    const callArgs = mockSendWhatsAppMessage.mock.calls[0]?.[1] as {
      template: string;
    };
    expect(callArgs?.template).toBe("charge_reminder_d0");
  });
});

describe("sendDueTodayNoticesForClub() — email fallback", () => {
  it("sends email fallback when WA fails and there is 1 prior failure (S-7)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider offline",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    mockSendEmailFallback.mockResolvedValue({
      messageId: "email-msg-1",
      status: "SENT",
    });

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockSendEmailFallback).toHaveBeenCalledOnce();
  });

  it("records error (no fallback) when WA fails on first attempt — 0 prior failures (S-7 threshold)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider offline",
    });
    mockCountRecentFailed.mockResolvedValue(0);

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.sent).toBe(0);
    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toBe("Provider offline");
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("does not send email fallback when email already sent in last 20h", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider offline",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("records combined error when both WA and email fallback fail", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "WA down",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    mockSendEmailFallback.mockResolvedValue({
      messageId: "email-msg-1",
      status: "FAILED",
      failReason: "Resend quota exceeded",
    });

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("WhatsApp FAILED");
    expect(result.errors[0]?.reason).toContain("Resend quota exceeded");
  });

  it("records error when email fallback throws", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "WA down",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    mockSendEmailFallback.mockRejectedValue(
      new Error("Template render failed"),
    );

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("email fallback threw");
    expect(result.errors[0]?.reason).toContain("Template render failed");
  });
});

describe("sendDueTodayNoticesForClub() — no email", () => {
  it("does not attempt email fallback when member has no email (S-8)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([
      makeCharge({ memberEmail: null }),
    ]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider offline",
    });

    const result = await sendDueTodayNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });
});

describe("sendDueTodayNoticesForClub() — decryptField failure", () => {
  it("re-throws errors from sendWhatsAppMessage (e.g. decryptField failure) (S-10)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockRejectedValueOnce(
      new Error("Decryption key missing"),
    );

    await expect(
      sendDueTodayNoticesForClub(MOCK_PRISMA, "club-1", DATE_START, DATE_END),
    ).rejects.toThrow("Decryption key missing");
  });
});

describe("getTargetDayRange with offsetDays=0", () => {
  it("returns today UTC range [00:00:00.000, 23:59:59.999] when offsetDays=0 (S-12)", async () => {
    const { getTargetDayRange } = await import("./due-today-notice.service.js");
    const now = new Date("2025-04-13T14:30:00.000Z");
    const [start, end] = getTargetDayRange(0, now);

    expect(start.toISOString()).toBe("2025-04-13T00:00:00.000Z");
    expect(end.toISOString()).toBe("2025-04-13T23:59:59.999Z");
  });
});
