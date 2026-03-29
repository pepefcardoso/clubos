import { describe, it, expect, vi } from "vitest";
import {
  matchOfxTransactions,
  confirmReconciliationMatch,
} from "./reconciliation.service.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import type { OfxTransaction } from "./reconciliation.schema.js";

function makeTx(overrides: Partial<OfxTransaction> = {}): OfxTransaction {
  return {
    fitId: "FIT001",
    type: "CREDIT",
    postedAt: new Date("2025-01-15T12:00:00.000Z"),
    amountCents: 8000,
    description: "PIX RECEBIDO",
    ...overrides,
  };
}

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_prisma),
  ),
}));

function makeRawCharge(overrides: Record<string, unknown> = {}) {
  return {
    chargeId: "charge-1",
    memberId: "member-1",
    memberName: "João Silva",
    amountCents: 8000,
    dueDate: new Date("2025-01-15T00:00:00.000Z"),
    status: "PENDING",
    ...overrides,
  };
}

function makeMockPrisma(rawCharges: unknown[] = []) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(rawCharges),
    payment: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    charge: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    member: {
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
}

describe("matchOfxTransactions — credit filtering", () => {
  it("skips debit transactions (amountCents <= 0)", async () => {
    const prisma = makeMockPrisma([]);
    const debit = makeTx({ amountCents: -5000, fitId: "DEB001" });
    const result = await matchOfxTransactions(prisma as never, "club-1", [
      debit,
    ]);
    expect(result.summary.skippedDebits).toBe(1);
    expect(result.matches).toHaveLength(0);
    expect(result.summary.total).toBe(0);
  });

  it("skips zero-amount transactions", async () => {
    const prisma = makeMockPrisma([]);
    const zero = makeTx({ amountCents: 0, fitId: "ZERO001" });
    const result = await matchOfxTransactions(prisma as never, "club-1", [
      zero,
    ]);
    expect(result.summary.skippedDebits).toBe(1);
  });

  it("returns early with empty summary when all transactions are debits", async () => {
    const prisma = makeMockPrisma([]);
    const result = await matchOfxTransactions(prisma as never, "club-1", [
      makeTx({ amountCents: -1000 }),
      makeTx({ amountCents: -2000 }),
    ]);
    expect(result.summary.total).toBe(0);
    expect(result.summary.skippedDebits).toBe(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("matchOfxTransactions — exact match", () => {
  it("produces a matched result with high confidence when dates are identical", async () => {
    const charge = makeRawCharge();
    const prisma = makeMockPrisma([charge]);
    const tx = makeTx({ amountCents: 8000 });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);

    expect(result.matches[0]?.matchStatus).toBe("matched");
    expect(result.matches[0]?.candidates[0]?.confidence).toBe("high");
    expect(result.summary.matched).toBe(1);
  });

  it("produces high confidence when date difference is exactly 1 day", async () => {
    const charge = makeRawCharge({
      dueDate: new Date("2025-01-14T00:00:00.000Z"),
    });
    const prisma = makeMockPrisma([charge]);
    const tx = makeTx({ postedAt: new Date("2025-01-15T12:00:00.000Z") });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);
    expect(result.matches[0]?.candidates[0]?.confidence).toBe("high");
  });

  it("produces medium confidence when date difference is 5 days", async () => {
    const charge = makeRawCharge({
      dueDate: new Date("2025-01-10T00:00:00.000Z"),
    });
    const prisma = makeMockPrisma([charge]);
    const tx = makeTx({ postedAt: new Date("2025-01-15T12:00:00.000Z") });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);
    expect(result.matches[0]?.candidates[0]?.confidence).toBe("medium");
    expect(result.matches[0]?.matchStatus).toBe("matched");
  });
});

describe("matchOfxTransactions — ambiguous", () => {
  it("returns ambiguous when multiple charges match value and date", async () => {
    const charges = [
      makeRawCharge({ chargeId: "charge-1", memberName: "João" }),
      makeRawCharge({
        chargeId: "charge-2",
        memberName: "Maria",
        dueDate: new Date("2025-01-16T00:00:00.000Z"),
      }),
    ];
    const prisma = makeMockPrisma(charges);
    const tx = makeTx({ amountCents: 8000 });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);
    expect(result.matches[0]?.matchStatus).toBe("ambiguous");
    expect(result.matches[0]?.candidates).toHaveLength(2);
    expect(result.summary.ambiguous).toBe(1);
  });

  it("orders candidates by confidence desc then dateDeltaDays asc", async () => {
    const charges = [
      makeRawCharge({
        chargeId: "charge-far",
        dueDate: new Date("2025-01-10T00:00:00.000Z"),
      }),
      makeRawCharge({
        chargeId: "charge-near",
        dueDate: new Date("2025-01-15T00:00:00.000Z"),
      }),
    ];
    const prisma = makeMockPrisma(charges);
    const tx = makeTx({ amountCents: 8000 });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);
    const candidates = result.matches[0]!.candidates;
    expect(candidates[0]!.chargeId).toBe("charge-near");
    expect(candidates[1]!.chargeId).toBe("charge-far");
  });
});

describe("matchOfxTransactions — unmatched", () => {
  it("returns unmatched when no charge has the same amount", async () => {
    const charge = makeRawCharge({ amountCents: 9999 });
    const prisma = makeMockPrisma([charge]);
    const tx = makeTx({ amountCents: 8000 });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);
    expect(result.matches[0]?.matchStatus).toBe("unmatched");
    expect(result.matches[0]?.candidates).toHaveLength(0);
    expect(result.summary.unmatched).toBe(1);
  });

  it("excludes charges beyond the 7-day tolerance", async () => {
    const charge = makeRawCharge({
      dueDate: new Date("2025-01-06T00:00:00.000Z"),
    });
    const prisma = makeMockPrisma([charge]);
    const tx = makeTx({ postedAt: new Date("2025-01-15T00:00:00.000Z") });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);
    expect(result.matches[0]?.matchStatus).toBe("unmatched");
  });

  it("includes charge at exactly the 7-day boundary", async () => {
    const charge = makeRawCharge({
      dueDate: new Date("2025-01-08T00:00:00.000Z"),
    });
    const prisma = makeMockPrisma([charge]);
    const tx = makeTx({ postedAt: new Date("2025-01-15T00:00:00.000Z") });

    const result = await matchOfxTransactions(prisma as never, "club-1", [tx]);
    expect(result.matches[0]?.matchStatus).toBe("matched");
  });
});

describe("matchOfxTransactions — summary accuracy", () => {
  it("counts mixed results correctly", async () => {
    const charges = [makeRawCharge({ amountCents: 8000 })];
    const prisma = makeMockPrisma(charges);

    const transactions = [
      makeTx({ fitId: "C1", amountCents: 8000 }),
      makeTx({ fitId: "D1", amountCents: -500 }),
      makeTx({ fitId: "U1", amountCents: 5000 }),
    ];

    const result = await matchOfxTransactions(
      prisma as never,
      "club-1",
      transactions,
    );

    expect(result.summary.total).toBe(2);
    expect(result.summary.matched).toBe(1);
    expect(result.summary.unmatched).toBe(1);
    expect(result.summary.skippedDebits).toBe(1);
  });
});

describe("confirmReconciliationMatch — idempotency", () => {
  it("returns existing payment without creating a duplicate when fitId is already used", async () => {
    const existingPayment = {
      id: "pay-existing",
      chargeId: "charge-1",
      paidAt: new Date("2025-01-15T12:00:00.000Z"),
      amountCents: 8000,
    };
    const prisma = makeMockPrisma();
    prisma.payment.findUnique.mockResolvedValue(existingPayment);

    const result = await confirmReconciliationMatch(
      prisma as never,
      "club-1",
      "user-1",
      {
        fitId: "FIT001",
        chargeId: "charge-1",
        paidAt: "2025-01-15T12:00:00.000Z",
        method: "PIX",
      },
    );

    expect(result.paymentId).toBe("pay-existing");
    expect(result.memberStatusUpdated).toBe(false);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});

describe("confirmReconciliationMatch — charge PENDING", () => {
  it("creates a Payment and marks the Charge as PAID", async () => {
    const prisma = makeMockPrisma();
    prisma.charge.findUnique.mockResolvedValue({
      id: "charge-1",
      amountCents: 8000,
      status: "PENDING",
      memberId: "member-1",
      member: { id: "member-1", status: "ACTIVE" },
    });
    prisma.payment.create.mockResolvedValue({
      id: "pay-new",
      chargeId: "charge-1",
      paidAt: new Date("2025-01-15T12:00:00.000Z"),
      amountCents: 8000,
    });

    const result = await confirmReconciliationMatch(
      prisma as never,
      "club-1",
      "user-1",
      {
        fitId: "FIT001",
        chargeId: "charge-1",
        paidAt: "2025-01-15T12:00:00.000Z",
        method: "PIX",
      },
    );

    expect(result.paymentId).toBe("pay-new");
    expect(result.amountCents).toBe(8000);
    expect(prisma.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
    expect(result.memberStatusUpdated).toBe(false);
  });

  it("does NOT update member status when member was already ACTIVE", async () => {
    const prisma = makeMockPrisma();
    prisma.charge.findUnique.mockResolvedValue({
      id: "charge-1",
      amountCents: 8000,
      status: "PENDING",
      memberId: "member-1",
      member: { id: "member-1", status: "ACTIVE" },
    });
    prisma.payment.create.mockResolvedValue({
      id: "pay-new",
      chargeId: "charge-1",
      paidAt: new Date(),
      amountCents: 8000,
    });

    await confirmReconciliationMatch(prisma as never, "club-1", "user-1", {
      fitId: "FIT001",
      chargeId: "charge-1",
      paidAt: "2025-01-15T12:00:00.000Z",
      method: "PIX",
    });

    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});

describe("confirmReconciliationMatch — charge OVERDUE", () => {
  it("updates member status to ACTIVE and sets memberStatusUpdated to true", async () => {
    const prisma = makeMockPrisma();
    prisma.charge.findUnique.mockResolvedValue({
      id: "charge-1",
      amountCents: 8000,
      status: "OVERDUE",
      memberId: "member-1",
      member: { id: "member-1", status: "OVERDUE" },
    });
    prisma.payment.create.mockResolvedValue({
      id: "pay-new",
      chargeId: "charge-1",
      paidAt: new Date(),
      amountCents: 8000,
    });

    const result = await confirmReconciliationMatch(
      prisma as never,
      "club-1",
      "user-1",
      {
        fitId: "FIT001",
        chargeId: "charge-1",
        paidAt: "2025-01-15T12:00:00.000Z",
        method: "PIX",
      },
    );

    expect(result.memberStatusUpdated).toBe(true);
    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });
});

describe("confirmReconciliationMatch — error cases", () => {
  it("throws NotFoundError when chargeId does not exist", async () => {
    const prisma = makeMockPrisma();
    prisma.charge.findUnique.mockResolvedValue(null);

    await expect(
      confirmReconciliationMatch(prisma as never, "club-1", "user-1", {
        fitId: "FIT001",
        chargeId: "nonexistent",
        paidAt: "2025-01-15T12:00:00.000Z",
        method: "PIX",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when charge is already PAID", async () => {
    const prisma = makeMockPrisma();
    prisma.charge.findUnique.mockResolvedValue({
      id: "charge-1",
      amountCents: 8000,
      status: "PAID",
      memberId: "member-1",
      member: { id: "member-1", status: "ACTIVE" },
    });

    await expect(
      confirmReconciliationMatch(prisma as never, "club-1", "user-1", {
        fitId: "FIT001",
        chargeId: "charge-1",
        paidAt: "2025-01-15T12:00:00.000Z",
        method: "PIX",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError when charge is CANCELLED", async () => {
    const prisma = makeMockPrisma();
    prisma.charge.findUnique.mockResolvedValue({
      id: "charge-1",
      amountCents: 8000,
      status: "CANCELLED",
      memberId: "member-1",
      member: { id: "member-1", status: "ACTIVE" },
    });

    await expect(
      confirmReconciliationMatch(prisma as never, "club-1", "user-1", {
        fitId: "FIT001",
        chargeId: "charge-1",
        paidAt: "2025-01-15T12:00:00.000Z",
        method: "PIX",
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("confirmReconciliationMatch — audit log", () => {
  it("creates an AuditLog with source: ofx_reconciliation", async () => {
    const prisma = makeMockPrisma();
    prisma.charge.findUnique.mockResolvedValue({
      id: "charge-1",
      amountCents: 8000,
      status: "PENDING",
      memberId: "member-1",
      member: { id: "member-1", status: "ACTIVE" },
    });
    prisma.payment.create.mockResolvedValue({
      id: "pay-new",
      chargeId: "charge-1",
      paidAt: new Date(),
      amountCents: 8000,
    });

    await confirmReconciliationMatch(prisma as never, "club-1", "actor-1", {
      fitId: "FIT001",
      chargeId: "charge-1",
      paidAt: "2025-01-15T12:00:00.000Z",
      method: "PIX",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: "actor-1",
          action: "PAYMENT_CONFIRMED",
          metadata: expect.objectContaining({ source: "ofx_reconciliation" }),
        }),
      }),
    );
  });
});
