import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPreviousMonthRange,
  generateAndSendMonthlyReport,
} from "./monthly-report.service.js";

const mockGetRevenueStatement = vi.fn();
vi.mock("../../modules/revenue-statement/revenue-statement.service.js", () => ({
  getRevenueStatement: (...args: unknown[]) => mockGetRevenueStatement(...args),
}));

const mockGetResendClient = vi.fn();
const mockSendEmail = vi.fn();
vi.mock("../../lib/email.js", () => ({
  getResendClient: () => mockGetResendClient(),
  getEmailFrom: () => "ClubOS <noreply@clubos.com.br>",
}));

function makeRevenueStatement(overrides = {}) {
  return {
    from: "2025-03-01",
    to: "2025-03-31",
    periods: [
      {
        period: "2025-03",
        revenueCents: 500000,
        pendingCents: 50000,
        overdueCents: 20000,
        chargeCount: 30,
        paymentCount: 25,
        expensesCents: 200000,
        netCents: 300000,
      },
    ],
    totals: {
      revenueCents: 500000,
      pendingCents: 50000,
      overdueCents: 20000,
      expensesCents: 200000,
      netCents: 300000,
      paymentCount: 25,
      chargeCount: 30,
    },
    ...overrides,
  };
}

const MOCK_PRISMA = {
  club: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
} as any;

describe("getPreviousMonthRange()", () => {
  it("returns March boundaries when called with an April date", () => {
    const now = new Date("2025-04-02T07:00:00.000Z");
    const { periodStart, periodEnd, reportPeriod } = getPreviousMonthRange(now);

    expect(periodStart.toISOString()).toBe("2025-03-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2025-03-31T23:59:59.999Z");
    expect(reportPeriod).toBe("2025-03");
  });

  it("handles year boundary: January → December of prior year", () => {
    const now = new Date("2025-01-02T07:00:00.000Z");
    const { periodStart, periodEnd, reportPeriod } = getPreviousMonthRange(now);

    expect(periodStart.toISOString()).toBe("2024-12-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2024-12-31T23:59:59.999Z");
    expect(reportPeriod).toBe("2024-12");
  });

  it("returns February boundaries when called with a March date (non-leap year)", () => {
    const now = new Date("2025-03-02T07:00:00.000Z");
    const { periodStart, periodEnd, reportPeriod } = getPreviousMonthRange(now);

    expect(periodStart.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2025-02-28T23:59:59.999Z");
    expect(reportPeriod).toBe("2025-02");
  });

  it("returns February boundaries correctly in a leap year", () => {
    const now = new Date("2024-03-02T07:00:00.000Z");
    const { periodStart, periodEnd, reportPeriod } = getPreviousMonthRange(now);

    expect(periodStart.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2024-02-29T23:59:59.999Z");
    expect(reportPeriod).toBe("2024-02");
  });

  it("returns November boundaries when called with a December date", () => {
    const now = new Date("2025-12-02T07:00:00.000Z");
    const { periodStart, periodEnd, reportPeriod } = getPreviousMonthRange(now);

    expect(periodStart.toISOString()).toBe("2025-11-01T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe("2025-11-30T23:59:59.999Z");
    expect(reportPeriod).toBe("2025-11");
  });

  it("periodEnd has correct time component (23:59:59.999)", () => {
    const now = new Date("2025-06-02T07:00:00.000Z");
    const { periodEnd } = getPreviousMonthRange(now);

    expect(periodEnd.getUTCHours()).toBe(23);
    expect(periodEnd.getUTCMinutes()).toBe(59);
    expect(periodEnd.getUTCSeconds()).toBe(59);
    expect(periodEnd.getUTCMilliseconds()).toBe(999);
  });

  it("periodStart has UTC midnight as time component (00:00:00.000)", () => {
    const now = new Date("2025-06-02T07:00:00.000Z");
    const { periodStart } = getPreviousMonthRange(now);

    expect(periodStart.getUTCHours()).toBe(0);
    expect(periodStart.getUTCMinutes()).toBe(0);
    expect(periodStart.getUTCSeconds()).toBe(0);
    expect(periodStart.getUTCMilliseconds()).toBe(0);
  });
});

describe("generateAndSendMonthlyReport() — no admin users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );
    (MOCK_PRISMA.club.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        name: "Clube Teste FC",
      },
    );
  });

  it("returns skipped=true when there are no ADMIN users", async () => {
    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no admin emails");
    expect(result.emailsSent).toBe(0);
    expect(mockGetRevenueStatement).not.toHaveBeenCalled();
  });

  it("returns skipped=true when admin users have empty email strings", async () => {
    (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { email: "" },
    ]);

    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no admin emails");
  });
});

describe("generateAndSendMonthlyReport() — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (MOCK_PRISMA.club.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        name: "Clube Teste FC",
      },
    );
    (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { email: "admin@clube.com" },
    ]);

    mockGetRevenueStatement.mockResolvedValue(makeRevenueStatement());
    mockGetResendClient.mockReturnValue({
      emails: {
        send: mockSendEmail.mockResolvedValue({
          data: { id: "email-1" },
          error: null,
        }),
      },
    });
  });

  it("calls getRevenueStatement with from/to mode using the exact period boundaries", async () => {
    await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(mockGetRevenueStatement).toHaveBeenCalledWith(
      MOCK_PRISMA,
      "club-1",
      { from: "2025-03-01", to: "2025-03-31" },
    );
  });

  it("returns correct counts on successful send to one admin", async () => {
    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(result.skipped).toBe(false);
    expect(result.adminCount).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(0);
    expect(result.reportPeriod).toBe("2025-03");
  });

  it("sends one email per admin (not BCC)", async () => {
    (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { email: "admin1@clube.com" },
      { email: "admin2@clube.com" },
    ]);

    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(result.adminCount).toBe(2);
    expect(result.emailsSent).toBe(2);
    expect(result.emailsFailed).toBe(0);

    const recipients = mockSendEmail.mock.calls.map(
      (call) => (call[0] as { to: string }).to,
    );
    expect(recipients).toContain("admin1@clube.com");
    expect(recipients).toContain("admin2@clube.com");
  });

  it("email includes PDF attachment with safe filename using clubId", async () => {
    await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    const emailArg = mockSendEmail.mock.calls[0]?.[0] as {
      attachments: Array<{ filename: string; content: unknown }>;
    };
    expect(emailArg.attachments).toHaveLength(1);
    expect(emailArg.attachments[0]?.filename).toBe(
      "relatorio-financeiro-2025-03-club-1.pdf",
    );
    expect(emailArg.attachments[0]?.content).toBeInstanceOf(Buffer);
  });

  it("email subject contains period and club name", async () => {
    await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    const emailArg = mockSendEmail.mock.calls[0]?.[0] as { subject: string };
    expect(emailArg.subject).toContain("2025");
    expect(emailArg.subject).toContain("Clube Teste FC");
    expect(emailArg.subject).toContain("[ClubOS]");
  });
});

describe("generateAndSendMonthlyReport() — partial email failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (MOCK_PRISMA.club.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        name: "Clube Teste FC",
      },
    );
    (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { email: "admin1@clube.com" },
      { email: "admin2@clube.com" },
    ]);

    mockGetRevenueStatement.mockResolvedValue(makeRevenueStatement());
    mockGetResendClient.mockReturnValue({
      emails: {
        send: mockSendEmail,
      },
    });
  });

  it("accumulates failed count when Resend returns an error for one recipient", async () => {
    mockSendEmail
      .mockResolvedValueOnce({ data: { id: "email-1" }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Invalid email" },
      });

    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(1);
    expect(result.skipped).toBe(false);
  });

  it("accumulates failed count when Resend throws for one recipient", async () => {
    mockSendEmail
      .mockResolvedValueOnce({ data: { id: "email-1" }, error: null })
      .mockRejectedValueOnce(new Error("Network timeout"));

    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(1);
  });

  it("continues sending to remaining admins after one failure", async () => {
    mockSendEmail
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({ data: { id: "email-2" }, error: null });

    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(result.emailsSent).toBe(1);
    expect(result.emailsFailed).toBe(1);
  });
});

describe("generateAndSendMonthlyReport() — club not found", () => {
  it("uses fallback club name 'Clube' when club.findUnique returns null", async () => {
    vi.clearAllMocks();
    (MOCK_PRISMA.club.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { email: "admin@clube.com" },
    ]);
    mockGetRevenueStatement.mockResolvedValue(makeRevenueStatement());
    mockGetResendClient.mockReturnValue({
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }),
      },
    });

    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(result.emailsSent).toBe(1);
    expect(result.skipped).toBe(false);
  });
});

describe("generateAndSendMonthlyReport() — empty periods", () => {
  it("generates PDF and sends email even when revenue data has no periods", async () => {
    vi.clearAllMocks();
    (MOCK_PRISMA.club.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        name: "Clube Vazio FC",
      },
    );
    (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { email: "admin@clube.com" },
    ]);
    mockGetRevenueStatement.mockResolvedValue({
      from: "2025-03-01",
      to: "2025-03-31",
      periods: [],
      totals: {
        revenueCents: 0,
        pendingCents: 0,
        overdueCents: 0,
        expensesCents: 0,
        netCents: 0,
        paymentCount: 0,
        chargeCount: 0,
      },
    });
    mockGetResendClient.mockReturnValue({
      emails: {
        send: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }),
      },
    });

    const result = await generateAndSendMonthlyReport(
      MOCK_PRISMA,
      "club-1",
      new Date("2025-03-01T00:00:00.000Z"),
      new Date("2025-03-31T23:59:59.999Z"),
      "2025-03",
    );

    expect(result.emailsSent).toBe(1);
    expect(result.skipped).toBe(false);
  });
});
