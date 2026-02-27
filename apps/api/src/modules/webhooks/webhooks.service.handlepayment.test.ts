import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  }),
}));

let _currentMockTx: ReturnType<typeof buildMockTxForPaymentReceived>;

vi.mock("../../lib/prisma.js", () => ({
  getPrismaClient: vi.fn().mockReturnValue({}),
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_currentMockTx),
  ),
}));

vi.mock("bullmq", () => {
  const workerListeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  let _capturedProcessor: ((job: unknown) => Promise<unknown>) | undefined;

  const MockWorker = vi
    .fn()
    .mockImplementation(
      (_queueName: string, processor: (job: unknown) => Promise<unknown>) => {
        _capturedProcessor = processor;
        (
          MockWorker as unknown as { _lastProcessor: typeof processor }
        )._lastProcessor = processor;
        return {
          on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
            workerListeners[event] = workerListeners[event] ?? [];
            workerListeners[event].push(handler);
          }),
          _listeners: workerListeners,
        };
      },
    );

  return { Worker: MockWorker };
});

import { withTenantSchema } from "../../lib/prisma.js";
import {
  handlePaymentReceived,
  ChargeNotFoundError,
  type PaymentReceivedResult,
} from "./webhooks.service.js";
import { startWebhookWorker } from "./webhooks.worker.js";
import type { WebhookEvent } from "../payments/gateway.interface.js";

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-001";

function buildMockTxForPaymentReceived(
  overrides: {
    chargeStatus?: string;
    memberStatus?: string;
    chargeFindUnique?: object | null;
    memberFindUnique?: object | null;
    paymentCreate?: object;
    chargeUpdateError?: Error;
    paymentCreateError?: Error;
    auditLogCreateError?: Error;
    memberFindUniqueError?: Error;
  } = {},
) {
  const defaultCharge = {
    id: "charge-abc",
    memberId: "member-001",
    amountCents: 14900,
    method: "PIX",
    status: overrides.chargeStatus ?? "PENDING",
  };

  const defaultPayment = {
    id: "pay-new-001",
    chargeId: "charge-abc",
    paidAt: new Date("2025-03-15T12:00:00.000Z"),
    method: "PIX",
    amountCents: 14900,
    gatewayTxid: "txid-001",
  };

  const defaultMember = {
    id: "member-001",
    status: overrides.memberStatus ?? "ACTIVE",
  };

  return {
    charge: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.chargeFindUnique !== undefined
            ? overrides.chargeFindUnique
            : defaultCharge,
        ),
      update: overrides.chargeUpdateError
        ? vi.fn().mockRejectedValue(overrides.chargeUpdateError)
        : vi.fn().mockResolvedValue({}),
    },
    member: {
      findUnique: overrides.memberFindUniqueError
        ? vi.fn().mockRejectedValue(overrides.memberFindUniqueError)
        : vi
            .fn()
            .mockResolvedValue(
              overrides.memberFindUnique !== undefined
                ? overrides.memberFindUnique
                : defaultMember,
            ),
      update: vi.fn().mockResolvedValue({}),
    },
    payment: {
      create: overrides.paymentCreateError
        ? vi.fn().mockRejectedValue(overrides.paymentCreateError)
        : vi.fn().mockResolvedValue(overrides.paymentCreate ?? defaultPayment),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: overrides.auditLogCreateError
        ? vi.fn().mockRejectedValue(overrides.auditLogCreateError)
        : vi.fn().mockResolvedValue({}),
    },
  };
}

function buildEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    type: "PAYMENT_RECEIVED",
    gatewayTxId: "txid-001",
    externalReference: "charge-abc",
    amountCents: 14900,
    rawPayload: {},
    ...overrides,
  };
}

function buildWorkerJob(
  overrides: {
    clubId?: string;
    event?: Partial<WebhookEvent>;
  } = {},
) {
  return {
    id: "job-test-001",
    attemptsMade: 1,
    log: vi.fn(),
    updateData: vi.fn().mockResolvedValue(undefined),
    data: {
      gatewayName: "asaas",
      receivedAt: new Date().toISOString(),
      event: buildEvent(overrides.event),
      clubId: overrides.clubId,
    },
  };
}

function setMockTx(tx: ReturnType<typeof buildMockTxForPaymentReceived>) {
  _currentMockTx = tx;
}

describe("handlePaymentReceived — happy paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HP-1: charge is PENDING, member is ACTIVE — payment created, charge → PAID, member NOT updated, memberStatusUpdated=false", async () => {
    const tx = buildMockTxForPaymentReceived({
      chargeStatus: "PENDING",
      memberStatus: "ACTIVE",
    });
    setMockTx(tx);

    const result = (await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    )) as PaymentReceivedResult;

    expect("skipped" in result).toBe(false);
    expect(result.memberStatusUpdated).toBe(false);
    expect(tx.payment.create).toHaveBeenCalledOnce();
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it("HP-2: charge is PENDING, member is OVERDUE — payment created, charge → PAID, member → ACTIVE, memberStatusUpdated=true", async () => {
    const tx = buildMockTxForPaymentReceived({
      chargeStatus: "PENDING",
      memberStatus: "OVERDUE",
    });
    setMockTx(tx);

    const result = (await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    )) as PaymentReceivedResult;

    expect(result.memberStatusUpdated).toBe(true);
    expect(tx.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member-001" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("HP-3: charge is OVERDUE (status), member is OVERDUE — payment created, charge → PAID, member → ACTIVE", async () => {
    const tx = buildMockTxForPaymentReceived({
      chargeStatus: "OVERDUE",
      memberStatus: "OVERDUE",
    });
    setMockTx(tx);

    const result = (await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    )) as PaymentReceivedResult;

    expect(result.memberStatusUpdated).toBe(true);
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
  });

  it("HP-4: charge is PENDING_RETRY — payment created, charge → PAID", async () => {
    const tx = buildMockTxForPaymentReceived({ chargeStatus: "PENDING_RETRY" });
    setMockTx(tx);

    const result = (await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    )) as PaymentReceivedResult;

    expect("skipped" in result).toBe(false);
    expect(tx.payment.create).toHaveBeenCalledOnce();
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
  });

  it("HP-5: event.amountCents is undefined — payment.amountCents falls back to charge.amountCents", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent({ amountCents: undefined }),
    );

    const createCall = tx.payment.create.mock.calls[0]?.[0] as {
      data: { amountCents: number };
    };
    expect(createCall.data.amountCents).toBe(14900);
  });

  it("HP-6: event.amountCents is provided — payment.amountCents uses event value", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent({ amountCents: 9900 }),
    );

    const createCall = tx.payment.create.mock.calls[0]?.[0] as {
      data: { amountCents: number };
    };
    expect(createCall.data.amountCents).toBe(9900);
  });

  it("HP-7: AuditLog entry is created with correct action, entityType, and metadata fields", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    await handlePaymentReceived(PRISMA_STUB, CLUB_ID, buildEvent());

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "PAYMENT_CONFIRMED",
          entityType: "Payment",
          metadata: expect.objectContaining({
            chargeId: "charge-abc",
            gatewayTxid: "txid-001",
          }),
        }),
      }),
    );
  });

  it("HP-8: result contains correct paymentId, chargeId, memberId, amountCents", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    const result = (await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    )) as PaymentReceivedResult;

    expect(result).toMatchObject({
      paymentId: "pay-new-001",
      chargeId: "charge-abc",
      memberId: "member-001",
      amountCents: 14900,
    });
  });

  it("HP-9: member status INACTIVE — does NOT update member to ACTIVE", async () => {
    const tx = buildMockTxForPaymentReceived({ memberStatus: "INACTIVE" });
    setMockTx(tx);

    const result = (await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    )) as PaymentReceivedResult;

    expect(tx.member.update).not.toHaveBeenCalled();
    expect(result.memberStatusUpdated).toBe(false);
  });

  it("HP-10: uses custom actorId in auditLog when provided", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
      "user-admin-001",
    );

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: "user-admin-001" }),
      }),
    );
  });

  it("HP-11: defaults actorId to 'system:webhook' when not provided", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    await handlePaymentReceived(PRISMA_STUB, CLUB_ID, buildEvent());

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: "system:webhook" }),
      }),
    );
  });

  it("HP-12: payment.create is called with correct gatewayTxid from event", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent({ gatewayTxId: "asaas-txn-xyz789" }),
    );

    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gatewayTxid: "asaas-txn-xyz789" }),
      }),
    );
  });

  it("HP-13: auditLog metadata.memberStatusUpdated matches actual update outcome", async () => {
    const tx = buildMockTxForPaymentReceived({ memberStatus: "OVERDUE" });
    setMockTx(tx);

    await handlePaymentReceived(PRISMA_STUB, CLUB_ID, buildEvent());

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ memberStatusUpdated: true }),
        }),
      }),
    );
  });
});

describe("handlePaymentReceived — guard / idempotency paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("G-1: charge.status === 'PAID' — returns { skipped: true, reason: 'charge_already_paid' }, no payment.create called", async () => {
    const tx = buildMockTxForPaymentReceived({ chargeStatus: "PAID" });
    setMockTx(tx);

    const result = await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    );

    expect(result).toEqual({ skipped: true, reason: "charge_already_paid" });
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.charge.update).not.toHaveBeenCalled();
    expect(tx.member.update).not.toHaveBeenCalled();
  });

  it("G-2: charge not found (findUnique returns null) — throws ChargeNotFoundError", async () => {
    const tx = buildMockTxForPaymentReceived({ chargeFindUnique: null });
    setMockTx(tx);

    await expect(
      handlePaymentReceived(PRISMA_STUB, CLUB_ID, buildEvent()),
    ).rejects.toThrow(ChargeNotFoundError);
  });

  it("G-2b: ChargeNotFoundError message includes the chargeId", async () => {
    const tx = buildMockTxForPaymentReceived({ chargeFindUnique: null });
    setMockTx(tx);

    await expect(
      handlePaymentReceived(
        PRISMA_STUB,
        CLUB_ID,
        buildEvent({ externalReference: "charge-missing-xyz" }),
      ),
    ).rejects.toThrow(`Charge "charge-missing-xyz" not found in tenant schema`);
  });
});

describe("handlePaymentReceived — error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("E-1: payment.create throws Prisma unique constraint — error propagates (BullMQ retries)", async () => {
    const uniqueErr = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
    });
    const tx = buildMockTxForPaymentReceived({ paymentCreateError: uniqueErr });
    setMockTx(tx);

    await expect(
      handlePaymentReceived(PRISMA_STUB, CLUB_ID, buildEvent()),
    ).rejects.toThrow("Unique constraint failed");
  });

  it("E-2: member.findUnique returns null — no member.update called, memberStatusUpdated=false", async () => {
    const tx = buildMockTxForPaymentReceived({ memberFindUnique: null });
    setMockTx(tx);

    const result = (await handlePaymentReceived(
      PRISMA_STUB,
      CLUB_ID,
      buildEvent(),
    )) as PaymentReceivedResult;

    expect(tx.member.update).not.toHaveBeenCalled();
    expect(result.memberStatusUpdated).toBe(false);
  });

  it("E-3: auditLog.create throws — error propagates (whole tx rolls back)", async () => {
    const tx = buildMockTxForPaymentReceived({
      auditLogCreateError: new Error("AuditLog write failed"),
    });
    setMockTx(tx);

    await expect(
      handlePaymentReceived(PRISMA_STUB, CLUB_ID, buildEvent()),
    ).rejects.toThrow("AuditLog write failed");
  });

  it("E-4: charge.update throws — error propagates", async () => {
    const tx = buildMockTxForPaymentReceived({
      chargeUpdateError: new Error("DB timeout on charge update"),
    });
    setMockTx(tx);

    await expect(
      handlePaymentReceived(PRISMA_STUB, CLUB_ID, buildEvent()),
    ).rejects.toThrow("DB timeout on charge update");
  });
});

describe("handlePaymentReceived — ChargeNotFoundError class", () => {
  it("has correct name and message", () => {
    const err = new ChargeNotFoundError("ch-123");
    expect(err.name).toBe("ChargeNotFoundError");
    expect(err.message).toBe(`Charge "ch-123" not found in tenant schema`);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("Webhook worker processor — T-027 PAYMENT_RECEIVED integration", () => {
  let capturedProcessor: ((job: unknown) => Promise<unknown>) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();

    const { Worker } = require("bullmq");
    vi.mocked(Worker).mockImplementation(
      (_queueName: string, processor: (job: unknown) => Promise<unknown>) => {
        capturedProcessor = processor;
        return {
          on: vi.fn(),
          _listeners: {},
        };
      },
    );

    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) => fn(_currentMockTx as never),
    );

    const { getPrismaClient } = require("../../lib/prisma.js");
    vi.mocked(getPrismaClient).mockReturnValue({
      club: { findMany: vi.fn().mockResolvedValue([{ id: CLUB_ID }]) },
    } as never);
  });

  it("W-1: worker calls handlePaymentReceived — payment.create is called with correct chargeId", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    startWebhookWorker();
    const processor = capturedProcessor!;
    const job = buildWorkerJob({ clubId: CLUB_ID });

    await processor(job);

    expect(tx.payment.create).toHaveBeenCalledOnce();
    const call = tx.payment.create.mock.calls[0]?.[0] as {
      data: { chargeId: string };
    };
    expect(call.data.chargeId).toBe("charge-abc");
  });

  it("W-2: handler returns success — worker returns { processed: true, paymentId, chargeId, memberId, amountCents, memberStatusUpdated }", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    startWebhookWorker();
    const processor = capturedProcessor!;
    const job = buildWorkerJob({ clubId: CLUB_ID });

    const result = await processor(job);

    expect(result).toMatchObject({
      processed: true,
      paymentId: "pay-new-001",
      chargeId: "charge-abc",
      memberId: "member-001",
      amountCents: 14900,
      memberStatusUpdated: false,
    });
  });

  it("W-3: handler returns { skipped } for already-PAID charge — worker returns skipped result and logs", async () => {
    const tx = buildMockTxForPaymentReceived({ chargeStatus: "PAID" });
    setMockTx(tx);

    startWebhookWorker();
    const processor = capturedProcessor!;
    const job = buildWorkerJob({ clubId: CLUB_ID });

    const result = await processor(job);

    expect(result).toEqual({ skipped: true, reason: "charge_already_paid" });
    const logMessages = job.log.mock.calls
      .map((c: string[]) => c[0])
      .join("\n");
    expect(logMessages).toContain("charge_already_paid");
  });

  it("W-4: handler throws ChargeNotFoundError — error propagates to BullMQ (not swallowed)", async () => {
    const tx = buildMockTxForPaymentReceived({ chargeFindUnique: null });
    setMockTx(tx);

    startWebhookWorker();
    const processor = capturedProcessor!;
    const job = buildWorkerJob({ clubId: CLUB_ID });

    await expect(processor(job)).rejects.toThrow(ChargeNotFoundError);
  });

  it("W-5: worker logs PAYMENT_RECEIVED processing start with chargeId and gatewayTxId", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    startWebhookWorker();
    const processor = capturedProcessor!;
    const job = buildWorkerJob({ clubId: CLUB_ID });

    await processor(job);

    const logMessages = job.log.mock.calls
      .map((c: string[]) => c[0])
      .join("\n");
    expect(logMessages).toContain("PAYMENT_RECEIVED");
    expect(logMessages).toContain("charge-abc");
    expect(logMessages).toContain("txid-001");
  });

  it("W-6: memberStatusUpdated=true propagated to worker result when member was OVERDUE", async () => {
    const tx = buildMockTxForPaymentReceived({ memberStatus: "OVERDUE" });
    setMockTx(tx);

    startWebhookWorker();
    const processor = capturedProcessor!;
    const job = buildWorkerJob({ clubId: CLUB_ID });

    const result = (await processor(job)) as Record<string, unknown>;

    expect(result["processed"]).toBe(true);
    expect(result["memberStatusUpdated"]).toBe(true);
  });

  it("W-7: existing tests still pass — handler_pending_t027 stub is replaced", async () => {
    const tx = buildMockTxForPaymentReceived();
    setMockTx(tx);

    startWebhookWorker();
    const processor = capturedProcessor!;
    const job = buildWorkerJob({ clubId: CLUB_ID });

    const result = await processor(job);

    expect(result).not.toEqual({
      processed: false,
      reason: "handler_pending_t027",
    });
  });
});
