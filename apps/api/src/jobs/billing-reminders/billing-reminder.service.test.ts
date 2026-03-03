import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendDailyRemindersForClub } from "./billing-reminder.service.js";

const mockHasRecentMessage = vi.fn();
const mockCountRecentFailed = vi.fn();
vi.mock("../../modules/messages/messages.service.js", () => ({
  hasRecentMessage: (...args: unknown[]) => mockHasRecentMessage(...args),
  countRecentFailedWhatsAppMessages: (...args: unknown[]) =>
    mockCountRecentFailed(...args),
}));

const mockBuildRenderedMessage = vi.fn();
vi.mock("../../modules//templates/templates.service.js", () => ({
  buildRenderedMessage: (...args: unknown[]) =>
    mockBuildRenderedMessage(...args),
}));

const mockSendWhatsAppMessage = vi.fn();
vi.mock("../../modules//whatsapp/whatsapp.service.js", () => ({
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
    dueDate: new Date("2025-04-04T03:00:00.000Z"),
    status: overrides.status ?? "PENDING",
    gatewayMeta: { pixCopyPaste: "00020126..." },
    member: {
      id: overrides.memberId ?? "member-1",
      name: "João Silva",
      phone: Buffer.from("encrypted"),
      email:
        overrides.memberEmail !== undefined
          ? overrides.memberEmail
          : "joao@example.com",
      status: overrides.memberStatus ?? "ACTIVE",
    },
  };
}

const MOCK_PRISMA = {} as never;
const DATE_START = new Date("2025-04-04T00:00:00.000Z");
const DATE_END = new Date("2025-04-04T23:59:59.999Z");

beforeEach(() => {
  vi.clearAllMocks();

  mockCheckAndConsumeWhatsAppRateLimit.mockResolvedValue({ allowed: true });
  mockBuildRenderedMessage.mockResolvedValue("Olá, João! ...");
  mockSendWhatsAppMessage.mockResolvedValue({ status: "SENT" });
  mockHasRecentMessage.mockResolvedValue(false);
  mockCountRecentFailed.mockResolvedValue(0);
});

import { withTenantSchema } from "../../lib/prisma.js";

describe("sendDailyRemindersForClub() — email fallback (T-036)", () => {
  it("sends WhatsApp and increments sent when WA succeeds", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);

    const result = await sendDailyRemindersForClub(
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

  it("records error (no fallback) when WA fails on first attempt (0 prior failures)", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider offline",
    });
    mockCountRecentFailed.mockResolvedValue(0);

    const result = await sendDailyRemindersForClub(
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

  it("sends email fallback when WA fails and there is 1 prior failure", async () => {
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

    const result = await sendDailyRemindersForClub(
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

    const result = await sendDailyRemindersForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("does not attempt email fallback when member has no email", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([
      makeCharge({ memberEmail: null }),
    ]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider offline",
    });

    const result = await sendDailyRemindersForClub(
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

    const result = await sendDailyRemindersForClub(
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

    const result = await sendDailyRemindersForClub(
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

  it("skips inactive members without attempting WA or email", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([
      makeCharge({ memberStatus: "INACTIVE" }),
    ]);

    const result = await sendDailyRemindersForClub(
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

  it("initialises emailFallbacks to 0", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([]);

    const result = await sendDailyRemindersForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
  });
});
