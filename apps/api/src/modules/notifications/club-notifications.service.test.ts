import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSubject,
  buildBody,
  notifyClubStaticPixFallback,
  type StaticPixFallbackCharge,
} from "./club-notifications.service.js";

const FIXED_DATE = new Date("2025-03-31T23:59:59.999Z");

const makeCharge = (
  overrides: Partial<StaticPixFallbackCharge> = {},
): StaticPixFallbackCharge => ({
  chargeId: "charge-001",
  memberId: "member-001",
  memberName: "João Silva",
  amountCents: 9900,
  dueDate: FIXED_DATE,
  staticPixKey: "12345678000195",
  ...overrides,
});

describe("buildSubject", () => {
  it("uses singular phrasing when count is 1", () => {
    const subject = buildSubject(1);
    expect(subject).toBe(
      "⚠️ ClubOS: cobrança processada via PIX estático (gateway indisponível)",
    );
    expect(subject).not.toContain("cobranças");
  });

  it("includes the count in plural phrasing when count > 1", () => {
    const subject = buildSubject(3);
    expect(subject).toBe(
      "⚠️ ClubOS: 3 cobranças processadas via PIX estático (gateway indisponível)",
    );
  });

  it("uses the correct count for large values", () => {
    expect(buildSubject(100)).toContain("100 cobranças");
  });
});

describe("buildBody", () => {
  const pixKey = "12345678000195";
  const charges = [
    makeCharge({ memberName: "João Silva", amountCents: 9900 }),
    makeCharge({
      chargeId: "charge-002",
      memberId: "member-002",
      memberName: "Maria Souza",
      amountCents: 19900,
    }),
  ];

  it("includes the static PIX key in both text and HTML", () => {
    const { text, html } = buildBody(charges, pixKey);
    expect(text).toContain(pixKey);
    expect(html).toContain(pixKey);
  });

  it("lists all affected member names in the text body", () => {
    const { text } = buildBody(charges, pixKey);
    expect(text).toContain("João Silva");
    expect(text).toContain("Maria Souza");
  });

  it("formats amounts as BRL currency strings", () => {
    const { text } = buildBody(charges, pixKey);
    expect(text).toContain("R$");
    expect(text).toContain("99");
  });

  it("includes action instructions in the text body", () => {
    const { text } = buildBody(charges, pixKey);
    expect(text).toContain("Compartilhe manualmente");
    expect(text).toContain("confirme-o pelo painel");
    expect(text).toContain("gateway de pagamento");
  });

  it("produces valid HTML wrapping", () => {
    const { html } = buildBody(charges, pixKey);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<body");
    expect(html).toContain("</body></html>");
  });

  it("renders member lines as <li> elements in HTML", () => {
    const { html } = buildBody(charges, pixKey);
    expect(html).toContain("<li>");
    expect(html).toContain("João Silva");
  });

  it("text and html both contain the same member names", () => {
    const { text, html } = buildBody(charges, pixKey);
    for (const charge of charges) {
      expect(text).toContain(charge.memberName);
      expect(html).toContain(charge.memberName);
    }
  });
});

vi.mock("../../lib/email.js", () => ({
  sendEmail: vi.fn(),
}));

import { sendEmail } from "../../lib/email.js";

const mockSendEmail = vi.mocked(sendEmail);

function makePrisma(adminEmails: string[]) {
  return {
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue(adminEmails.map((email) => ({ email }))),
    },
  } as unknown as Parameters<typeof notifyClubStaticPixFallback>[0];
}

describe("notifyClubStaticPixFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns immediately without sending when charges array is empty", async () => {
    const prisma = makePrisma(["admin@clube.com"]);
    await notifyClubStaticPixFallback(prisma, "club-001", []);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("sends one email per ADMIN user", async () => {
    const prisma = makePrisma(["admin1@clube.com", "admin2@clube.com"]);
    await notifyClubStaticPixFallback(prisma, "club-001", [makeCharge()]);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin1@clube.com" }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin2@clube.com" }),
    );
  });

  it("queries for ADMIN role users of the correct club", async () => {
    const prisma = makePrisma(["admin@clube.com"]);
    await notifyClubStaticPixFallback(prisma, "club-xyz", [makeCharge()]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { clubId: "club-xyz", role: "ADMIN" },
      select: { email: true },
    });
  });

  it("does not throw when sendEmail fails — logs error instead", async () => {
    const prisma = makePrisma(["admin@clube.com"]);
    mockSendEmail.mockRejectedValueOnce(new Error("Resend API down"));
    await expect(
      notifyClubStaticPixFallback(prisma, "club-001", [makeCharge()]),
    ).resolves.toBeUndefined();
  });

  it("continues sending to remaining admins when one send fails", async () => {
    const prisma = makePrisma(["fail@clube.com", "ok@clube.com"]);
    mockSendEmail
      .mockRejectedValueOnce(new Error("SMTP error"))
      .mockResolvedValueOnce(undefined);
    await notifyClubStaticPixFallback(prisma, "club-001", [makeCharge()]);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("returns with a warning log and no email when no ADMIN users found", async () => {
    const consoleSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const prisma = makePrisma([]);
    await notifyClubStaticPixFallback(prisma, "club-001", [makeCharge()]);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("No ADMIN users found"),
    );
    consoleSpy.mockRestore();
  });

  it("uses singular subject when exactly one charge is affected", async () => {
    const prisma = makePrisma(["admin@clube.com"]);
    await notifyClubStaticPixFallback(prisma, "club-001", [makeCharge()]);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("cobrança processada"),
      }),
    );
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).not.toMatch(/\d+ cobranças/);
  });

  it("uses plural subject with count when multiple charges are affected", async () => {
    const prisma = makePrisma(["admin@clube.com"]);
    const charges = [
      makeCharge({ chargeId: "c1", memberId: "m1" }),
      makeCharge({ chargeId: "c2", memberId: "m2" }),
      makeCharge({ chargeId: "c3", memberId: "m3" }),
    ];
    await notifyClubStaticPixFallback(prisma, "club-001", charges);
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.subject).toContain("3 cobranças");
  });

  it("includes the static PIX key and member names in the email body", async () => {
    const prisma = makePrisma(["admin@clube.com"]);
    const charge = makeCharge({
      memberName: "Carlos Andrade",
      staticPixKey: "carlos@pix.com",
    });
    await notifyClubStaticPixFallback(prisma, "club-001", [charge]);
    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.text).toContain("carlos@pix.com");
    expect(call?.text).toContain("Carlos Andrade");
  });

  it("batches all fallback charges into a single call per admin", async () => {
    const prisma = makePrisma(["admin@clube.com"]);
    const charges = Array.from({ length: 5 }, (_, i) =>
      makeCharge({
        chargeId: `c${i}`,
        memberId: `m${i}`,
        memberName: `Membro ${i}`,
      }),
    );
    await notifyClubStaticPixFallback(prisma, "club-001", charges);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0]?.[0];
    for (let i = 0; i < 5; i++) {
      expect(call?.text).toContain(`Membro ${i}`);
    }
  });
});
