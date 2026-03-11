import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  hasRecentContractAlert,
  buildExpiryEmailBody,
  buildBidPendingEmailBody,
  buildBidPendingBatchEmailBody,
  renderedBodyToHtml,
  formatContractDate,
  sendContractAlertsForClub,
} from "./contract-alert.service.js";

const mockSendEmail = vi.fn();
vi.mock("../../lib/email.js", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) =>
      fn(mockTx),
  ),
}));

import { withTenantSchema } from "../../lib/prisma.js";

const mockTx = {
  auditLog: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  contract: {
    findMany: vi.fn(),
  },
};

const MOCK_PRISMA = {
  user: { findMany: vi.fn() },
  club: { findUnique: vi.fn() },
} as unknown as PrismaClient;

const D7_START = new Date("2025-03-08T00:00:00.000Z");
const D7_END = new Date("2025-03-08T23:59:59.999Z");
const D1_START = new Date("2025-03-02T00:00:00.000Z");
const D1_END = new Date("2025-03-02T23:59:59.999Z");

function makeContract(
  overrides: Partial<{
    id: string;
    type: string;
    status: string;
    endDate: Date | null;
    startDate: Date;
    bidRegistered: boolean;
    athleteName: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "contract-1",
    athleteId: "athlete-1",
    type: overrides.type ?? "PROFESSIONAL",
    status: overrides.status ?? "ACTIVE",
    endDate:
      overrides.endDate !== undefined
        ? overrides.endDate
        : new Date("2025-03-08T00:00:00.000Z"),
    startDate: overrides.startDate ?? new Date("2024-01-01T00:00:00.000Z"),
    bidRegistered: overrides.bidRegistered ?? false,
    federationCode: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    athlete: { name: overrides.athleteName ?? "Carlos Silva" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  (MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { email: "admin@clube.com" },
  ]);
  (MOCK_PRISMA.club.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    name: "Clube Teste FC",
  });

  mockTx.auditLog.findFirst.mockResolvedValue(null);
  mockTx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  mockTx.contract.findMany.mockResolvedValue([]);
  mockSendEmail.mockResolvedValue(undefined);
});

describe("renderedBodyToHtml", () => {
  it("wraps text in HTML boilerplate", () => {
    const result = renderedBodyToHtml("Hello");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("Hello");
  });

  it("converts *bold* to <strong>", () => {
    expect(renderedBodyToHtml("*name*")).toContain("<strong>name</strong>");
  });

  it("converts newlines to <br>", () => {
    expect(renderedBodyToHtml("line1\nline2")).toContain("line1<br>line2");
  });

  it("escapes HTML special chars", () => {
    const result = renderedBodyToHtml("<script>&</script>");
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&amp;");
    expect(result).not.toContain("<script>");
  });
});

describe("formatContractDate", () => {
  it("formats a UTC date to DD/MM/YYYY", () => {
    const date = new Date("2025-03-08T12:00:00.000Z");
    expect(formatContractDate(date)).toBe("08/03/2025");
  });
});

describe("buildExpiryEmailBody", () => {
  const base = {
    athleteName: "Carlos Silva",
    contractType: "PROFESSIONAL",
    endDate: "08/03/2025",
    daysRemaining: 7,
    clubName: "Clube Teste FC",
  };

  it("D-7: subject contains 7 and athlete name", () => {
    const { subject } = buildExpiryEmailBody(base);
    expect(subject).toContain("7");
    expect(subject).toContain("Carlos Silva");
  });

  it("D-1: subject contains 1 and uses singular 'dia'", () => {
    const { subject } = buildExpiryEmailBody({ ...base, daysRemaining: 1 });
    expect(subject).toContain("1 dia");
    expect(subject).not.toContain("dias");
  });

  it("text body includes athlete name, type, end date, and club name", () => {
    const { text } = buildExpiryEmailBody(base);
    expect(text).toContain("Carlos Silva");
    expect(text).toContain("PROFESSIONAL");
    expect(text).toContain("08/03/2025");
    expect(text).toContain("Clube Teste FC");
  });

  it("returns non-empty html", () => {
    const { html } = buildExpiryEmailBody(base);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html.length).toBeGreaterThan(50);
  });
});

describe("buildBidPendingEmailBody", () => {
  const base = {
    athleteName: "João Pedro",
    contractType: "AMATEUR",
    startDate: "01/01/2024",
    clubName: "Clube Teste FC",
  };

  it("subject contains athlete name", () => {
    expect(buildBidPendingEmailBody(base).subject).toContain("João Pedro");
  });

  it("text mentions BID and escalation warning", () => {
    const { text } = buildBidPendingEmailBody(base);
    expect(text).toContain("BID");
    expect(text).toContain("NÃO pode ser escalado");
  });
});

describe("buildBidPendingBatchEmailBody", () => {
  it("subject includes count of athletes and club name", () => {
    const { subject } = buildBidPendingBatchEmailBody({
      athletes: [
        {
          athleteName: "A",
          contractType: "PROFESSIONAL",
          startDate: "01/01/2024",
        },
        { athleteName: "B", contractType: "AMATEUR", startDate: "01/02/2024" },
      ],
      clubName: "Clube FC",
    });
    expect(subject).toContain("2");
    expect(subject).toContain("Clube FC");
  });

  it("text body lists each athlete by name", () => {
    const { text } = buildBidPendingBatchEmailBody({
      athletes: [
        {
          athleteName: "Carlos",
          contractType: "PROFESSIONAL",
          startDate: "01/01/2024",
        },
        {
          athleteName: "Pedro",
          contractType: "FORMATIVE",
          startDate: "01/06/2024",
        },
      ],
      clubName: "Clube FC",
    });
    expect(text).toContain("Carlos");
    expect(text).toContain("Pedro");
    expect(text).toContain("NÃO podem ser escalados");
  });
});

describe("hasRecentContractAlert", () => {
  it("returns true when audit_log has a matching entry within window", async () => {
    mockTx.auditLog.findFirst.mockResolvedValueOnce({ id: "audit-1" });
    const result = await hasRecentContractAlert(
      mockTx as never,
      "contract-1",
      "CONTRACT_EXPIRY_D7",
      20,
    );
    expect(result).toBe(true);
  });

  it("returns false when audit_log has no matching entry", async () => {
    mockTx.auditLog.findFirst.mockResolvedValueOnce(null);
    const result = await hasRecentContractAlert(
      mockTx as never,
      "contract-1",
      "CONTRACT_EXPIRY_D7",
      20,
    );
    expect(result).toBe(false);
  });

  it("queries with correct action and entityType", async () => {
    mockTx.auditLog.findFirst.mockResolvedValueOnce(null);
    await hasRecentContractAlert(mockTx as never, "c-1", "BID_PENDING", 20);
    expect(mockTx.auditLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: "CONTRACT_UPDATED",
          entityType: "ContractAlert",
          entityId: "c-1",
        }),
      }),
    );
  });
});

describe("sendContractAlertsForClub — no admin users", () => {
  it("returns empty result when club has no ADMIN users", async () => {
    (
      MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([]);

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.expiryD7Sent).toBe(0);
    expect(result.expiryD1Sent).toBe(0);
    expect(result.bidPendingSent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns empty result when club is not found", async () => {
    (
      MOCK_PRISMA.club.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null);

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.expiryD7Sent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("sendContractAlertsForClub — D-7 alerts", () => {
  it("sends D-7 email and increments expiryD7Sent", async () => {
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [makeContract()],
        expiringD1: [],
        bidPending: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.expiryD7Sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@clube.com",
        subject: expect.stringContaining("7"),
      }),
    );
  });

  it("skips D-7 alert when one was already sent within 20h", async () => {
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [makeContract()],
        expiringD1: [],
        bidPending: [],
      })
      .mockResolvedValueOnce({ id: "audit-existing" });

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.expiryD7Sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("captures send failure in errors[] and continues loop", async () => {
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [makeContract({ id: "c-1" }), makeContract({ id: "c-2" })],
        expiringD1: [],
        bidPending: [],
      })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("Resend error"));

    vi.mocked(withTenantSchema).mockReset();
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [makeContract({ id: "c-1" }), makeContract({ id: "c-2" })],
        expiringD1: [],
        bidPending: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    mockSendEmail
      .mockRejectedValueOnce(new Error("Resend timeout"))
      .mockResolvedValueOnce(undefined);

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toContain("Resend timeout");
    expect(result.expiryD7Sent).toBe(1);
  });
});

describe("sendContractAlertsForClub — D-1 alerts", () => {
  it("sends D-1 email and increments expiryD1Sent", async () => {
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [],
        expiringD1: [makeContract({ id: "c-d1" })],
        bidPending: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.expiryD1Sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("1 dia"),
      }),
    );
  });
});

describe("sendContractAlertsForClub — BID pending alerts (batched)", () => {
  it("sends a single batched email for all BID-pending contracts and increments bidPendingSent to 1", async () => {
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [],
        expiringD1: [],
        bidPending: [
          makeContract({ id: "c-1", athleteName: "Atleta A" }),
          makeContract({ id: "c-2", athleteName: "Atleta B" }),
        ],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.bidPendingSent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const callArg = mockSendEmail.mock.calls[0]?.[0] as {
      subject: string;
      text: string;
    };
    expect(callArg.text).toContain("Atleta A");
    expect(callArg.text).toContain("Atleta B");
  });

  it("skips BID batch when already alerted within 20h and counts each contract as skipped", async () => {
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [],
        expiringD1: [],
        bidPending: [makeContract({ id: "c-1" }), makeContract({ id: "c-2" })],
      })
      .mockResolvedValueOnce({ id: "audit-existing" });

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result.bidPendingSent).toBe(0);
    expect(result.skipped).toBe(2);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("uses synthetic BID_PENDING_BATCH:{clubId} as the idempotency key", async () => {
    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [],
        expiringD1: [],
        bidPending: [makeContract()],
      })
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(async (_p, _id, fn) => {
        const captureTx = {
          auditLog: { create: vi.fn().mockResolvedValue({ id: "a" }) },
        };
        await fn(captureTx as never);
        expect(captureTx.auditLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              entityId: "BID_PENDING_BATCH:club-1",
            }),
          }),
        );
      });

    await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );
  });

  it("sends to ALL admin emails, not just the first", async () => {
    (
      MOCK_PRISMA.user.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce([
      { email: "admin1@clube.com" },
      { email: "admin2@clube.com" },
    ]);

    vi.mocked(withTenantSchema)
      .mockResolvedValueOnce({
        expiringD7: [makeContract()],
        expiringD1: [],
        bidPending: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);

    await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const recipients = mockSendEmail.mock.calls.map(
      (call) => (call[0] as { to: string }).to,
    );
    expect(recipients).toContain("admin1@clube.com");
    expect(recipients).toContain("admin2@clube.com");
  });
});

describe("sendContractAlertsForClub — initialisation", () => {
  it("result has correct zero-value shape when no contracts exist", async () => {
    vi.mocked(withTenantSchema).mockResolvedValueOnce({
      expiringD7: [],
      expiringD1: [],
      bidPending: [],
    });

    const result = await sendContractAlertsForClub(
      MOCK_PRISMA,
      "club-1",
      D7_START,
      D7_END,
      D1_START,
      D1_END,
    );

    expect(result).toEqual({
      clubId: "club-1",
      expiryD7Sent: 0,
      expiryD1Sent: 0,
      bidPendingSent: 0,
      skipped: 0,
      errors: [],
    });
  });
});
