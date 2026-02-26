import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateMonthlyCharges,
  getBillingPeriod,
  getDefaultDueDate,
  hasExistingCharge,
  dispatchChargeToGateway,
} from "./charges.service.js";
import { NoActivePlanError } from "../plans/plans.service.js";
import { assertClubHasActivePlan } from "../plans/plans.service.js";

vi.mock("../plans/plans.service.js", () => ({
  assertClubHasActivePlan: vi.fn().mockResolvedValue(undefined),
  NoActivePlanError: class NoActivePlanError extends Error {
    constructor() {
      super(
        "O clube não possui nenhum plano ativo. Crie ao menos um plano antes de gerar cobranças.",
      );
      this.name = "NoActivePlanError";
    }
  },
}));

vi.mock("../payments/gateway.registry.js", () => ({
  GatewayRegistry: {
    forMethod: vi.fn(),
  },
}));

vi.mock("../../lib/crypto.js", () => ({
  decryptField: vi.fn(),
  getEncryptionKey: vi
    .fn()
    .mockReturnValue("test-key-32-chars-minimum-length!"),
}));

let _currentMockTx: ReturnType<typeof buildMockTx>;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_currentMockTx),
  ),
}));

import { GatewayRegistry } from "../payments/gateway.registry.js";
import * as cryptoLib from "../../lib/crypto.js";

interface MockMemberPlan {
  memberId: string;
  member: { id: string; name: string };
  plan: { id: string; priceCents: number };
  endedAt: null | Date;
}

function buildMockTx(
  overrides: {
    memberPlanFindMany?: MockMemberPlan[];
    chargeFindFirst?: { id: string } | null;
    chargeCreate?: {
      id: string;
      amountCents: number;
      dueDate: Date;
      method: string;
    };
    chargeUpdate?: object;
    memberFindUnique?: object | null;
    auditLogCreate?: object;
    chargeCreateError?: Error;
    auditLogCreateError?: Error;
  } = {},
) {
  const defaultCharge = {
    id: "charge-abc",
    amountCents: 9900,
    dueDate: new Date("2025-03-31T23:59:59.999Z"),
    method: "PIX",
  };

  return {
    memberPlan: {
      findMany: vi.fn().mockResolvedValue(overrides.memberPlanFindMany ?? []),
    },
    charge: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.chargeFindFirst !== undefined
            ? overrides.chargeFindFirst
            : null,
        ),
      create: overrides.chargeCreateError
        ? vi.fn().mockRejectedValue(overrides.chargeCreateError)
        : vi.fn().mockResolvedValue(overrides.chargeCreate ?? defaultCharge),
      update: vi.fn().mockResolvedValue(overrides.chargeUpdate ?? {}),
    },
    member: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.memberFindUnique !== undefined
            ? overrides.memberFindUnique
            : buildMockMemberRow("m1", "Alice"),
        ),
    },
    auditLog: {
      create: overrides.auditLogCreateError
        ? vi.fn().mockRejectedValue(overrides.auditLogCreateError)
        : vi.fn().mockResolvedValue({}),
    },
  };
}

function buildMockMemberRow(id: string, name: string) {
  return {
    id,
    name,
    cpf: new Uint8Array([1, 2, 3]),
    phone: new Uint8Array([4, 5, 6]),
    email: `${name.toLowerCase()}@example.com`,
    status: "ACTIVE",
    joinedAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeMemberPlan(
  memberId: string,
  memberName: string,
  priceCents = 9900,
  endedAt: null | Date = null,
): MockMemberPlan {
  return {
    memberId,
    member: { id: memberId, name: memberName },
    plan: { id: `plan-${memberId}`, priceCents },
    endedAt,
  };
}

function buildMockGateway(
  overrides: { createChargeResult?: object; createChargeError?: Error } = {},
) {
  return {
    name: "asaas",
    supportedMethods: ["PIX", "CREDIT_CARD", "DEBIT_CARD", "BOLETO"],
    createCharge: overrides.createChargeError
      ? vi.fn().mockRejectedValue(overrides.createChargeError)
      : vi.fn().mockResolvedValue(
          overrides.createChargeResult ?? {
            externalId: "pay_abc123",
            status: "PENDING",
            meta: {
              qrCodeBase64: "base64encodedstring",
              pixCopyPaste: "00020126580014br.gov.bcb.pix...",
            },
          },
        ),
    cancelCharge: vi.fn(),
    parseWebhook: vi.fn(),
  };
}

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-001";
const ACTOR_ID = "user-admin-001";

function setMockTx(tx: ReturnType<typeof buildMockTx>) {
  _currentMockTx = tx;
}

describe("getBillingPeriod", () => {
  it("returns current UTC year/month when no argument provided", () => {
    const now = new Date();
    const { year, month } = getBillingPeriod();
    expect(year).toBe(now.getUTCFullYear());
    expect(month).toBe(now.getUTCMonth() + 1);
  });

  it("parses an ISO string and returns the correct year/month", () => {
    const { year, month } = getBillingPeriod("2025-03-15T00:00:00.000Z");
    expect(year).toBe(2025);
    expect(month).toBe(3);
  });

  it("ignores the day component of the provided date", () => {
    const { year, month } = getBillingPeriod("2025-11-28T00:00:00.000Z");
    expect(year).toBe(2025);
    expect(month).toBe(11);
  });
});

describe("getDefaultDueDate", () => {
  it("returns the last day of the given month", () => {
    const due = getDefaultDueDate(2025, 3);
    expect(due.getUTCDate()).toBe(31);
    expect(due.getUTCMonth()).toBe(2);
    expect(due.getUTCFullYear()).toBe(2025);
  });

  it("handles February in a non-leap year (28 days)", () => {
    const due = getDefaultDueDate(2025, 2);
    expect(due.getUTCDate()).toBe(28);
  });

  it("handles February in a leap year (29 days)", () => {
    const due = getDefaultDueDate(2024, 2);
    expect(due.getUTCDate()).toBe(29);
  });

  it("handles months with 30 days", () => {
    const due = getDefaultDueDate(2025, 4);
    expect(due.getUTCDate()).toBe(30);
  });
});

describe("hasExistingCharge", () => {
  it("returns true when a non-cancelled charge exists within the period", async () => {
    const tx = buildMockTx({ chargeFindFirst: { id: "charge-existing" } });
    const result = await hasExistingCharge(tx as never, "member-1", 2025, 3);
    expect(result).toBe(true);
  });

  it("returns false when no charge exists in the period", async () => {
    const tx = buildMockTx({ chargeFindFirst: null });
    const result = await hasExistingCharge(tx as never, "member-1", 2025, 3);
    expect(result).toBe(false);
  });

  it("queries with CANCELLED excluded from the notIn filter", async () => {
    const tx = buildMockTx({ chargeFindFirst: null });
    await hasExistingCharge(tx as never, "member-1", 2025, 3);

    expect(tx.charge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["CANCELLED"] },
        }),
      }),
    );
  });
});

describe("dispatchChargeToGateway", () => {
  const mockCharge = {
    id: "charge-001",
    amountCents: 14900,
    dueDate: new Date("2025-03-31T23:59:59.999Z"),
    method: "PIX",
  };

  const mockMember = buildMockMemberRow("member-001", "João Silva");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoLib.decryptField)
      .mockResolvedValueOnce("12345678900")
      .mockResolvedValueOnce("11999990000");
  });

  it("updates charge with externalId, gatewayName, and gatewayMeta on success", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      mockCharge,
      mockMember,
    );

    expect("error" in result).toBe(false);
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "charge-001" },
        data: expect.objectContaining({
          externalId: "pay_abc123",
          gatewayName: "asaas",
          gatewayMeta: expect.objectContaining({
            qrCodeBase64: "base64encodedstring",
            pixCopyPaste: "00020126580014br.gov.bcb.pix...",
          }),
        }),
      }),
    );
  });

  it("returns error string and does not throw when gateway.createCharge fails", async () => {
    const gateway = buildMockGateway({
      createChargeError: new Error("Asaas network timeout"),
    });
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      mockCharge,
      mockMember,
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("Asaas network timeout");
    }
    expect(tx.charge.update).not.toHaveBeenCalled();
  });

  it("returns undefined immediately for CASH method without calling gateway", async () => {
    const forMethodSpy = vi.mocked(GatewayRegistry.forMethod);

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      { ...mockCharge, method: "CASH" },
      mockMember,
    );

    expect("error" in result).toBe(false);
    expect(forMethodSpy).not.toHaveBeenCalled();
    expect(tx.charge.update).not.toHaveBeenCalled();
  });

  it("returns undefined immediately for BANK_TRANSFER method without calling gateway", async () => {
    const forMethodSpy = vi.mocked(GatewayRegistry.forMethod);

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      { ...mockCharge, method: "BANK_TRANSFER" },
      mockMember,
    );

    expect("error" in result).toBe(false);
    expect(forMethodSpy).not.toHaveBeenCalled();
  });

  it("re-throws when decryptField fails (system misconfiguration)", async () => {
    vi.mocked(cryptoLib.decryptField).mockReset();
    vi.mocked(cryptoLib.decryptField).mockRejectedValue(
      new Error("pgp_sym_decrypt returned no result"),
    );

    const tx = buildMockTx();
    setMockTx(tx);

    await expect(
      dispatchChargeToGateway(PRISMA_STUB, CLUB_ID, mockCharge, mockMember),
    ).rejects.toThrow("pgp_sym_decrypt returned no result");
  });

  it("returns error string when no gateway supports the method", async () => {
    vi.mocked(GatewayRegistry.forMethod).mockImplementation(() => {
      throw new Error(
        'No gateway registered that supports payment method "PIX"',
      );
    });

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      mockCharge,
      mockMember,
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("No gateway registered");
    }
    expect(tx.charge.update).not.toHaveBeenCalled();
  });

  it("passes charge.id as the idempotencyKey to the gateway", async () => {
    const gateway = buildMockGateway();
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const tx = buildMockTx();
    setMockTx(tx);

    await dispatchChargeToGateway(PRISMA_STUB, CLUB_ID, mockCharge, mockMember);

    expect(gateway.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "charge-001" }),
    );
  });

  it("returns 'Unknown gateway error' for non-Error throws from gateway", async () => {
    const gateway = buildMockGateway();
    gateway.createCharge = vi.fn().mockRejectedValue("string error");
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      mockCharge,
      mockMember,
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("Unknown gateway error");
    }
  });
});

describe("dispatchChargeToGateway — persistence (T-022)", () => {
  const mockCharge = {
    id: "charge-001",
    amountCents: 14900,
    dueDate: new Date("2025-03-31T23:59:59.999Z"),
    method: "PIX",
  };

  const mockMember = buildMockMemberRow("member-001", "João Silva");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoLib.decryptField)
      .mockResolvedValueOnce("12345678900")
      .mockResolvedValueOnce("11999990000");
  });

  it("T-022-1: persists externalId, gatewayName and gatewayMeta atomically", async () => {
    const gateway = buildMockGateway({
      createChargeResult: {
        externalId: "pay_pix_xyz",
        status: "PENDING",
        meta: { qrCodeBase64: "abc123==", pixCopyPaste: "00020126..." },
      },
    });
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      mockCharge,
      mockMember,
    );

    expect("error" in result).toBe(false);
    expect(tx.charge.update).toHaveBeenCalledWith({
      where: { id: "charge-001" },
      data: {
        externalId: "pay_pix_xyz",
        gatewayName: "asaas",
        gatewayMeta: { qrCodeBase64: "abc123==", pixCopyPaste: "00020126..." },
      },
    });
  });

  it("T-022-2: returns structured result with externalId, gatewayName and meta on success", async () => {
    const meta = { qrCodeBase64: "abc123==", pixCopyPaste: "00020126..." };
    const gateway = buildMockGateway({
      createChargeResult: {
        externalId: "pay_pix_xyz",
        status: "PENDING",
        meta,
      },
    });
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      mockCharge,
      mockMember,
    );

    expect(result).toMatchObject({
      externalId: "pay_pix_xyz",
      gatewayName: "asaas",
      meta,
    });
  });

  it("T-022-3: DB update failure after gateway success surfaces as error containing externalId", async () => {
    const gateway = buildMockGateway({
      createChargeResult: {
        externalId: "pay_pix_xyz",
        status: "PENDING",
        meta: { qrCodeBase64: "abc", pixCopyPaste: "00020..." },
      },
    });
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const tx = buildMockTx();
    tx.charge.update = vi.fn().mockRejectedValue(new Error("DB timeout"));
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      mockCharge,
      mockMember,
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("DB update failed after gateway success");
      expect(result.error).toContain("pay_pix_xyz");
    }
  });

  it("T-022-4: CASH method returns empty meta object without calling charge.update", async () => {
    const tx = buildMockTx();
    setMockTx(tx);

    const result = await dispatchChargeToGateway(
      PRISMA_STUB,
      CLUB_ID,
      { ...mockCharge, method: "CASH" },
      mockMember,
    );

    expect("error" in result).toBe(false);
    expect(tx.charge.update).not.toHaveBeenCalled();
  });

  it("T-022-5: generated charge summary contains gatewayMeta and externalId when dispatch succeeds", async () => {
    const meta = { qrCodeBase64: "qrbase64==", pixCopyPaste: "00020126..." };
    const gateway = buildMockGateway({
      createChargeResult: { externalId: "pay_123", status: "PENDING", meta },
    });
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(gateway as never);

    const members = [makeMemberPlan("m1", "Alice", 14900)];
    const tx = buildMockTx({
      memberPlanFindMany: members,
      chargeCreate: {
        id: "charge-gen-1",
        amountCents: 14900,
        dueDate: new Date("2025-03-31T23:59:59.999Z"),
        method: "PIX",
      },
    });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.charges[0]).toMatchObject({
      chargeId: "charge-gen-1",
      externalId: "pay_123",
      gatewayName: "asaas",
      gatewayMeta: meta,
    });
  });
});

describe("generateMonthlyCharges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertClubHasActivePlan).mockResolvedValue(undefined);
    vi.mocked(cryptoLib.decryptField)
      .mockResolvedValueOnce("12345678900")
      .mockResolvedValueOnce("11999990000");
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(
      buildMockGateway() as never,
    );
  });

  it("TC-1: generates charges for 3 active members with active plans", async () => {
    const members = [
      makeMemberPlan("m1", "Alice", 9900),
      makeMemberPlan("m2", "Bob", 14900),
      makeMemberPlan("m3", "Carol", 4900),
    ];

    let callCount = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.create = vi.fn().mockImplementation(() =>
      Promise.resolve({
        id: `charge-${++callCount}`,
        amountCents: 9900,
        dueDate: new Date("2025-03-31T23:59:59.999Z"),
        method: "PIX",
      }),
    );
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      { billingPeriod: "2025-03-01T00:00:00.000Z" },
    );

    expect(result.generated).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.charges).toHaveLength(3);
  });

  it("TC-2: skips member that already has a PENDING charge this month", async () => {
    const members = [
      makeMemberPlan("m1", "Alice"),
      makeMemberPlan("m2", "Bob"),
      makeMemberPlan("m3", "Carol"),
    ];

    let findFirstCall = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.findFirst = vi.fn().mockImplementation(() => {
      findFirstCall++;
      if (findFirstCall === 2)
        return Promise.resolve({ id: "existing-charge" });
      return Promise.resolve(null);
    });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("TC-3: skips member that already has a PAID charge this month", async () => {
    const members = [
      makeMemberPlan("m1", "Alice"),
      makeMemberPlan("m2", "Bob"),
    ];

    let findFirstCall = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.findFirst = vi.fn().mockImplementation(() => {
      findFirstCall++;
      if (findFirstCall === 1) return Promise.resolve({ id: "paid-charge" });
      return Promise.resolve(null);
    });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("TC-4: generates charge when only a CANCELLED charge exists this month", async () => {
    const members = [makeMemberPlan("m1", "Alice")];

    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.findFirst = vi.fn().mockResolvedValue(null);
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("TC-5: throws NoActivePlanError when club has no active plans", async () => {
    vi.mocked(assertClubHasActivePlan).mockRejectedValue(
      new NoActivePlanError(),
    );

    setMockTx(buildMockTx());

    await expect(
      generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID),
    ).rejects.toThrow(NoActivePlanError);
  });

  it("TC-6: returns zero generated when there are no eligible members", async () => {
    const tx = buildMockTx({ memberPlanFindMany: [] });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.charges).toHaveLength(0);
  });

  it("TC-7: isolates failure — one DB error lands in errors[], others succeed", async () => {
    const members = [
      makeMemberPlan("m1", "Alice"),
      makeMemberPlan("m2", "Bob"),
      makeMemberPlan("m3", "Carol"),
    ];

    let createCall = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.create = vi.fn().mockImplementation(() => {
      createCall++;
      if (createCall === 2) {
        return Promise.reject(new Error("DB connection lost"));
      }
      return Promise.resolve({
        id: `charge-${createCall}`,
        amountCents: 9900,
        dueDate: new Date("2025-03-31T23:59:59.999Z"),
        method: "PIX",
      });
    });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      memberId: "m2",
      reason: "DB connection lost",
    });
  });

  it("TC-8: uses provided billingPeriod to compute the correct due date", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      billingPeriod: "2025-02-01T00:00:00.000Z",
    });

    const createCall = tx.charge.create.mock.calls[0]?.[0] as {
      data: { dueDate: Date };
    };
    expect(createCall?.data.dueDate.getUTCDate()).toBe(28);
    expect(createCall?.data.dueDate.getUTCMonth()).toBe(1);
  });

  it("TC-9: uses custom dueDate override instead of last-day-of-month default", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const customDue = "2025-03-15T00:00:00.000Z";
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      billingPeriod: "2025-03-01T00:00:00.000Z",
      dueDate: customDue,
    });

    const createCall = tx.charge.create.mock.calls[0]?.[0] as {
      data: { dueDate: Date };
    };
    expect(createCall?.data.dueDate).toEqual(new Date(customDue));
  });

  it("TC-10: does not process members whose MemberPlan has endedAt set", async () => {
    const members = [makeMemberPlan("m1", "Alice", 9900, null)];
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(1);
    expect(tx.memberPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ endedAt: null }),
      }),
    );
  });

  it("TC-11: captures error in errors[] when auditLog.create fails", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.auditLog.create = vi
      .fn()
      .mockRejectedValue(new Error("AuditLog write failed"));
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      memberId: "m1",
      reason: "AuditLog write failed",
    });
    expect(result.generated).toBe(0);
  });

  it("TC-12: creates charge with PIX method, PENDING status, and correct amountCents", async () => {
    const members = [makeMemberPlan("m1", "Alice", 14900)];
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(tx.charge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memberId: "m1",
          amountCents: 14900,
          status: "PENDING",
          method: "PIX",
        }),
      }),
    );
  });

  it("TC-13: populates charges[] in result with correct summary fields", async () => {
    const members = [makeMemberPlan("m1", "Alice", 9900)];
    const dueDate = new Date("2025-03-31T23:59:59.999Z");
    const tx = buildMockTx({
      memberPlanFindMany: members,
      chargeCreate: {
        id: "charge-xyz",
        amountCents: 9900,
        dueDate,
        method: "PIX",
      },
    });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.charges[0]).toMatchObject({
      chargeId: "charge-xyz",
      memberId: "m1",
      memberName: "Alice",
      amountCents: 9900,
      dueDate,
    });
  });

  it("TC-14: handles non-Error throws with 'Unknown error' reason", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.create = vi.fn().mockRejectedValue("some string error");
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.errors[0]).toMatchObject({
      memberId: "m1",
      reason: "Unknown error",
    });
  });

  it("TC-15 (T-021): gateway succeeds — result.gatewayErrors is empty", async () => {
    const members = [
      makeMemberPlan("m1", "Alice", 9900),
      makeMemberPlan("m2", "Bob", 14900),
    ];
    const tx = buildMockTx({ memberPlanFindMany: members });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");
    vi.mocked(GatewayRegistry.forMethod).mockReturnValue(
      buildMockGateway() as never,
    );

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(2);
    expect(result.gatewayErrors).toHaveLength(0);
  });

  it("TC-16 (T-021): gateway failure populates gatewayErrors[], charge still counted as generated", async () => {
    const members = [
      makeMemberPlan("m1", "Alice"),
      makeMemberPlan("m2", "Bob"),
    ];

    let forMethodCall = 0;
    vi.mocked(GatewayRegistry.forMethod).mockImplementation(() => {
      forMethodCall++;
      if (forMethodCall === 1) {
        return buildMockGateway({
          createChargeError: new Error("Gateway 503"),
        }) as never;
      }
      return buildMockGateway() as never;
    });

    let createCall = 0;
    const tx = buildMockTx({ memberPlanFindMany: members });
    tx.charge.create = vi.fn().mockImplementation(() => {
      createCall++;
      return Promise.resolve({
        id: `charge-${createCall}`,
        amountCents: 9900,
        dueDate: new Date("2025-03-31T23:59:59.999Z"),
        method: "PIX",
      });
    });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.gatewayErrors).toHaveLength(1);
    expect(result.gatewayErrors[0]).toMatchObject({
      memberId: "m1",
      reason: "Gateway 503",
    });
  });

  it("TC-17 (T-021): null member row after charge creation gracefully skips dispatch", async () => {
    const members = [makeMemberPlan("m1", "Alice")];
    const tx = buildMockTx({
      memberPlanFindMany: members,
      memberFindUnique: null,
    });
    setMockTx(tx);
    vi.mocked(cryptoLib.decryptField).mockResolvedValue("12345678900");

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(result.generated).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.gatewayErrors).toHaveLength(0);
    expect(tx.charge.update).not.toHaveBeenCalled();
  });

  it("TC-18 (T-021): result always has gatewayErrors array even when empty", async () => {
    const tx = buildMockTx({ memberPlanFindMany: [] });
    setMockTx(tx);

    const result = await generateMonthlyCharges(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(Array.isArray(result.gatewayErrors)).toBe(true);
    expect(result.gatewayErrors).toHaveLength(0);
  });
});
