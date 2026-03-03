import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendEmailFallbackMessage,
  buildEmailSubject,
  renderedBodyToHtml,
  type EmailFallbackInput,
} from "./email-fallback.service.js";
import type { GatewayMeta } from "../charges/charges.schema.js";

const mockSendEmail = vi.fn();
vi.mock("../../lib/email.js", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockBuildRenderedMessage = vi.fn();
vi.mock("../templates/templates.service.js", () => ({
  buildRenderedMessage: (...args: unknown[]) =>
    mockBuildRenderedMessage(...args),
}));

const mockMessageCreate = vi.fn();
const mockMessageUpdate = vi.fn();
const mockAuditLogCreate = vi.fn();

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) => {
      return fn({
        message: {
          create: mockMessageCreate,
          update: mockMessageUpdate,
        },
        auditLog: {
          create: mockAuditLogCreate,
        },
      });
    },
  ),
}));

const MOCK_PRISMA = {} as never;

const BASE_INPUT: EmailFallbackInput = {
  clubId: "club-1",
  memberId: "member-1",
  memberName: "João Silva",
  memberEmail: "joao@example.com",
  template: "charge_reminder_d3",
  charge: {
    amountCents: 9900,
    dueDate: new Date("2025-04-04T03:00:00.000Z"),
    gatewayMeta: { pixCopyPaste: "00020126..." } as GatewayMeta,
  },
};

const MOCK_MESSAGE = {
  id: "msg-abc-123",
  memberId: "member-1",
  channel: "EMAIL",
  template: "charge_reminder_d3",
  status: "PENDING",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildRenderedMessage.mockResolvedValue("Olá, João! Sua mensalidade...");
  mockMessageCreate.mockResolvedValue(MOCK_MESSAGE);
  mockMessageUpdate.mockResolvedValue({ ...MOCK_MESSAGE, status: "SENT" });
  mockAuditLogCreate.mockResolvedValue({});
});

describe("sendEmailFallbackMessage()", () => {
  it("sends email and returns SENT when sendEmail resolves", async () => {
    mockSendEmail.mockResolvedValue(undefined);

    const result = await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(result.status).toBe("SENT");
    expect(result.messageId).toBe("msg-abc-123");
    expect(result.failReason).toBeUndefined();
  });

  it("calls sendEmail with correct arguments", async () => {
    mockSendEmail.mockResolvedValue(undefined);

    await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "joao@example.com",
        subject: "Lembrete: sua mensalidade vence em 3 dias",
      }),
    );
  });

  it("sets sentAt on message update when SENT", async () => {
    mockSendEmail.mockResolvedValue(undefined);

    await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(mockMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SENT",
          sentAt: expect.any(Date),
        }),
      }),
    );
  });

  it("records FAILED and sets failReason when sendEmail throws", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend quota exceeded"));

    const result = await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(result.status).toBe("FAILED");
    expect(result.failReason).toBe("Resend quota exceeded");
  });

  it("does not re-throw when sendEmail fails", async () => {
    mockSendEmail.mockRejectedValue(new Error("network error"));

    await expect(
      sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT),
    ).resolves.not.toThrow();
  });

  it("updates message to FAILED with failReason on send error", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend API error"));

    await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(mockMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          failReason: "Resend API error",
        }),
      }),
    );
  });

  it("propagates error when buildRenderedMessage throws", async () => {
    mockBuildRenderedMessage.mockRejectedValue(
      new Error("Template key not found"),
    );

    await expect(
      sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT),
    ).rejects.toThrow("Template key not found");
  });

  it("writes AuditLog entry with fallback=true on SENT", async () => {
    mockSendEmail.mockResolvedValue(undefined);

    await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(mockAuditLogCreate).toHaveBeenCalledOnce();
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "MESSAGE_SENT",
          memberId: "member-1",
          metadata: expect.objectContaining({
            channel: "EMAIL",
            fallback: true,
            status: "SENT",
          }),
        }),
      }),
    );
  });

  it("writes AuditLog entry with status=FAILED on send error", async () => {
    mockSendEmail.mockRejectedValue(new Error("Resend error"));

    await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            status: "FAILED",
            fallback: true,
          }),
        }),
      }),
    );
  });

  it("uses the provided actorId in AuditLog", async () => {
    mockSendEmail.mockResolvedValue(undefined);

    await sendEmailFallbackMessage(
      MOCK_PRISMA,
      BASE_INPUT,
      "system:job:d3-reminder",
    );

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: "system:job:d3-reminder" }),
      }),
    );
  });

  it("handles non-Error throws from sendEmail gracefully", async () => {
    mockSendEmail.mockRejectedValue("string error");

    const result = await sendEmailFallbackMessage(MOCK_PRISMA, BASE_INPUT);

    expect(result.status).toBe("FAILED");
    expect(result.failReason).toBe("Unknown email error");
  });
});

describe("buildEmailSubject()", () => {
  it("returns correct subject for charge_reminder_d3", () => {
    expect(buildEmailSubject("charge_reminder_d3")).toBe(
      "Lembrete: sua mensalidade vence em 3 dias",
    );
  });

  it("returns correct subject for charge_reminder_d0", () => {
    expect(buildEmailSubject("charge_reminder_d0")).toBe(
      "Atenção: sua mensalidade vence hoje",
    );
  });

  it("returns correct subject for overdue_notice", () => {
    expect(buildEmailSubject("overdue_notice")).toBe(
      "Aviso de inadimplência — regularize sua situação",
    );
  });
});

describe("renderedBodyToHtml()", () => {
  it("wraps content in minimal HTML boilerplate", () => {
    const html = renderedBodyToHtml("Hello");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<body");
    expect(html).toContain("Hello");
  });

  it("converts *bold* markers to <strong> tags", () => {
    const html = renderedBodyToHtml("Valor: *R$ 99,00*");
    expect(html).toContain("<strong>R$ 99,00</strong>");
  });

  it("converts newlines to <br> tags", () => {
    const html = renderedBodyToHtml("Line one\nLine two");
    expect(html).toContain("Line one<br>Line two");
  });

  it("escapes HTML special characters", () => {
    const html = renderedBodyToHtml("5 > 3 & <test>");
    expect(html).toContain("5 &gt; 3 &amp; &lt;test&gt;");
  });

  it("handles multiple bold markers in the same string", () => {
    const html = renderedBodyToHtml("*valor* e *data*");
    expect(html).toContain("<strong>valor</strong> e <strong>data</strong>");
  });

  it("preserves non-bold asterisk-like content correctly", () => {
    const html = renderedBodyToHtml("normal text");
    expect(html).not.toContain("<strong>");
  });
});
