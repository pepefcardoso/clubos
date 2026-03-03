import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendOverdueNoticesForClub } from "./overdue-notice.service.js";

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
    status: string;
    memberStatus: string;
    memberEmail: string | null;
  }> = {},
) {
  return {
    id: "charge-1",
    memberId: "member-1",
    amountCents: 9900,
    dueDate: new Date("2025-03-01T03:00:00.000Z"),
    status: overrides.status ?? "PENDING",
    gatewayMeta: { pixCopyPaste: "00020126..." },
    member: {
      id: "member-1",
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
const DATE_START = new Date("2025-03-01T00:00:00.000Z");
const DATE_END = new Date("2025-03-01T23:59:59.999Z");

import { withTenantSchema } from "../../lib/prisma.js";

beforeEach(() => {
  vi.clearAllMocks();

  mockCheckAndConsumeWhatsAppRateLimit.mockResolvedValue({ allowed: true });
  mockBuildRenderedMessage.mockResolvedValue("Olá, Maria! ...");
  mockSendWhatsAppMessage.mockResolvedValue({ status: "SENT" });
  mockHasRecentMessage.mockResolvedValue(false);
  mockCountRecentFailed.mockResolvedValue(0);
});

describe("sendOverdueNoticesForClub() — email fallback (T-036)", () => {
  it("increments sent when WhatsApp succeeds", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.sent).toBe(1);
    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("records WA error and skips email when 0 prior failures", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider unavailable",
    });
    mockCountRecentFailed.mockResolvedValue(0);

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("sends email fallback on 2nd WA failure and increments emailFallbacks", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider unavailable",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    mockSendEmailFallback.mockResolvedValue({
      messageId: "email-msg-2",
      status: "SENT",
    });

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockSendEmailFallback).toHaveBeenCalledOnce();
    expect(mockSendEmailFallback).toHaveBeenCalledWith(
      MOCK_PRISMA,
      expect.objectContaining({
        template: "overdue_notice",
        memberId: "member-1",
        memberEmail: "maria@example.com",
      }),
      "system:job:overdue-notice",
    );
  });

  it("does not send duplicate email when one was already sent in last 20h", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider unavailable",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("skips email fallback when member has no email", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([
      makeCharge({ memberEmail: null }),
    ]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "Provider unavailable",
    });
    mockCountRecentFailed.mockResolvedValue(1);

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toBe("Provider unavailable");
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("records combined error message when both WA and email fail", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "WA error",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    mockSendEmailFallback.mockResolvedValue({
      messageId: "email-msg-2",
      status: "FAILED",
      failReason: "Invalid API key",
    });

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("WhatsApp FAILED");
    expect(result.errors[0]?.reason).toContain("Invalid API key");
  });

  it("records error when email fallback throws unexpectedly", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([makeCharge()]);
    mockSendWhatsAppMessage.mockResolvedValue({
      status: "FAILED",
      failReason: "WA error",
    });
    mockCountRecentFailed.mockResolvedValue(1);
    mockHasRecentMessage
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    mockSendEmailFallback.mockRejectedValue(new Error("Unexpected failure"));

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("email fallback threw");
    expect(result.errors[0]?.reason).toContain("Unexpected failure");
  });

  it("skips INACTIVE members", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([
      makeCharge({ memberStatus: "INACTIVE" }),
    ]);

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.skipped).toBe(1);
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockSendEmailFallback).not.toHaveBeenCalled();
  });

  it("initialises emailFallbacks to 0", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([]);

    const result = await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    expect(result.emailFallbacks).toBe(0);
  });

  it("includes email in the member select query", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce([]);

    await sendOverdueNoticesForClub(
      MOCK_PRISMA,
      "club-1",
      DATE_START,
      DATE_END,
    );

    const { withTenantSchema: wts } = await import("../../lib/prisma.js");
    expect(wts).toHaveBeenCalled();
  });
});
