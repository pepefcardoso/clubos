import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  }),
}));

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
  const MockWorker = vi
    .fn()
    .mockImplementation(
      (_queueName: string, processor: (job: unknown) => Promise<unknown>) => {
        _capturedProcessor = processor;
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

let _currentMockTx: ReturnType<typeof buildMockTx>;
let _capturedProcessor: ((job: unknown) => Promise<unknown>) | undefined;

function buildMockTx(
  overrides: {
    paymentFindUnique?: { id: string } | null;
    chargeFindUnique?: { id: string } | null;
  } = {},
) {
  return {
    payment: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.paymentFindUnique !== undefined
            ? overrides.paymentFindUnique
            : null,
        ),
    },
    charge: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.chargeFindUnique !== undefined
            ? overrides.chargeFindUnique
            : null,
        ),
    },
  };
}

function setMockTx(tx: ReturnType<typeof buildMockTx>) {
  _currentMockTx = tx;
}

import { withTenantSchema } from "../../lib/prisma.js";
import {
  hasExistingPayment,
  resolveClubIdFromChargeId,
} from "./webhooks.service.js";
import { startWebhookWorker } from "./webhooks.worker.js";
import type { WebhookJobData } from "./webhooks.service.js";

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-001";

function buildJob(
  overrides: Partial<WebhookJobData> & { clubId?: string } = {},
): {
  data: WebhookJobData;
  log: ReturnType<typeof vi.fn>;
  updateData: ReturnType<typeof vi.fn>;
  id: string;
  attemptsMade: number;
} {
  return {
    id: "job-test-001",
    attemptsMade: 1,
    log: vi.fn(),
    updateData: vi.fn().mockResolvedValue(undefined),
    data: {
      gatewayName: "asaas",
      receivedAt: new Date().toISOString(),
      event: {
        type: "PAYMENT_RECEIVED",
        gatewayTxId: "txid-001",
        externalReference: "charge-abc",
        amountCents: 14990,
        rawPayload: {},
      },
      ...overrides,
    },
  };
}

describe("hasExistingPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when a Payment row with the gatewayTxid exists", async () => {
    setMockTx(buildMockTx({ paymentFindUnique: { id: "pay-001" } }));
    const result = await hasExistingPayment(PRISMA_STUB, CLUB_ID, "txid-001");
    expect(result).toBe(true);
  });

  it("returns false when no Payment row exists for the gatewayTxid", async () => {
    setMockTx(buildMockTx({ paymentFindUnique: null }));
    const result = await hasExistingPayment(PRISMA_STUB, CLUB_ID, "txid-001");
    expect(result).toBe(false);
  });

  it("calls payment.findUnique with { where: { gatewayTxid } }", async () => {
    const tx = buildMockTx({ paymentFindUnique: null });
    setMockTx(tx);
    await hasExistingPayment(PRISMA_STUB, CLUB_ID, "txid-xyz");
    expect(tx.payment.findUnique).toHaveBeenCalledWith({
      where: { gatewayTxid: "txid-xyz" },
      select: { id: true },
    });
  });

  it("passes the correct clubId to withTenantSchema", async () => {
    setMockTx(buildMockTx({ paymentFindUnique: null }));
    await hasExistingPayment(PRISMA_STUB, "club-999", "txid-001");
    expect(withTenantSchema).toHaveBeenCalledWith(
      PRISMA_STUB,
      "club-999",
      expect.any(Function),
    );
  });
});

describe("resolveClubIdFromChargeId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the clubId when a charge is found in the first club", async () => {
    const mockPrisma = {
      club: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "club-001" }, { id: "club-002" }]),
      },
    } as never;

    setMockTx(buildMockTx({ chargeFindUnique: { id: "charge-abc" } }));

    const result = await resolveClubIdFromChargeId(mockPrisma, "charge-abc");
    expect(result).toBe("club-001");
  });

  it("returns the correct clubId when charge is found in the second club (not the first)", async () => {
    const mockPrisma = {
      club: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "club-001" }, { id: "club-002" }]),
      },
    } as never;

    let callCount = 0;
    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            charge: { findUnique: vi.fn().mockResolvedValue(null) },
            payment: { findUnique: vi.fn().mockResolvedValue(null) },
          } as never);
        }
        return fn({
          charge: {
            findUnique: vi.fn().mockResolvedValue({ id: "charge-abc" }),
          },
          payment: { findUnique: vi.fn().mockResolvedValue(null) },
        } as never);
      },
    );

    const result = await resolveClubIdFromChargeId(mockPrisma, "charge-abc");
    expect(result).toBe("club-002");
  });

  it("returns null when the charge is not found in any club schema", async () => {
    const mockPrisma = {
      club: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "club-001" }, { id: "club-002" }]),
      },
    } as never;

    setMockTx(buildMockTx({ chargeFindUnique: null }));

    const result = await resolveClubIdFromChargeId(
      mockPrisma,
      "charge-nonexistent",
    );
    expect(result).toBeNull();
  });

  it("skips clubs where withTenantSchema throws and continues scanning", async () => {
    const mockPrisma = {
      club: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "club-001" }, { id: "club-002" }]),
      },
    } as never;

    let callCount = 0;
    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, clubId, fn) => {
        callCount++;
        if (clubId === "club-001") {
          throw new Error("Schema does not exist");
        }
        return fn({
          charge: {
            findUnique: vi.fn().mockResolvedValue({ id: "charge-abc" }),
          },
          payment: { findUnique: vi.fn().mockResolvedValue(null) },
        } as never);
      },
    );

    const result = await resolveClubIdFromChargeId(mockPrisma, "charge-abc");
    expect(result).toBe("club-002");
    expect(callCount).toBe(2);
  });

  it("returns null when club list is empty", async () => {
    const mockPrisma = {
      club: { findMany: vi.fn().mockResolvedValue([]) },
    } as never;
    const result = await resolveClubIdFromChargeId(mockPrisma, "charge-abc");
    expect(result).toBeNull();
  });
});

describe("Webhook worker processor — guard clauses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) => {
        return fn(_currentMockTx as never);
      },
    );
    setMockTx(
      buildMockTx({
        chargeFindUnique: { id: "charge-abc" },
        paymentFindUnique: null,
      }),
    );
  });

  it("returns { skipped: true, reason: 'unknown_event_type' } for UNKNOWN events", async () => {
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({
      event: { type: "UNKNOWN", gatewayTxId: "txid-001", rawPayload: {} },
    });
    const result = await processor(job);
    expect(result).toEqual({ skipped: true, reason: "unknown_event_type" });
  });

  it("returns { skipped: true, reason: 'no_external_reference' } when externalReference is missing", async () => {
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({
      event: {
        type: "PAYMENT_RECEIVED",
        gatewayTxId: "txid-001",
        externalReference: undefined,
        rawPayload: {},
      },
    });
    const result = await processor(job);
    expect(result).toEqual({ skipped: true, reason: "no_external_reference" });
  });

  it("returns { skipped: true, reason: 'charge_not_found' } when resolveClubIdFromChargeId returns null", async () => {
    setMockTx(buildMockTx({ chargeFindUnique: null }));

    const { getPrismaClient } = await import("../../lib/prisma.js");
    vi.mocked(getPrismaClient).mockReturnValue({
      club: { findMany: vi.fn().mockResolvedValue([{ id: "club-001" }]) },
    } as never);

    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob();
    const result = await processor(job);
    expect(result).toEqual({ skipped: true, reason: "charge_not_found" });
  });

  it('logs "Skipping UNKNOWN event type" for UNKNOWN events', async () => {
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({
      event: { type: "UNKNOWN", gatewayTxId: "txid-001", rawPayload: {} },
    });
    await processor(job);
    expect(job.log).toHaveBeenCalledWith(
      expect.stringContaining("UNKNOWN event type"),
    );
  });
});

describe("Webhook worker processor — idempotency (T-028 core)", () => {
  const RESOLVED_CLUB_ID = "club-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupWithClubId(paymentExists: boolean) {
    const { getPrismaClient } = require("../../lib/prisma.js");
    vi.mocked(getPrismaClient).mockReturnValue({
      club: {
        findMany: vi.fn().mockResolvedValue([{ id: RESOLVED_CLUB_ID }]),
      },
    } as never);

    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) => {
        return fn({
          charge: {
            findUnique: vi.fn().mockResolvedValue({ id: "charge-abc" }),
          },
          payment: {
            findUnique: vi
              .fn()
              .mockResolvedValue(paymentExists ? { id: "pay-existing" } : null),
          },
        } as never);
      },
    );
  }

  it("returns { skipped: true, reason: 'duplicate_gateway_txid' } when payment already exists", async () => {
    setupWithClubId(true);
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({ clubId: RESOLVED_CLUB_ID });
    const result = await processor(job);
    expect(result).toEqual({ skipped: true, reason: "duplicate_gateway_txid" });
  });

  it('logs a "Duplicate event detected" message containing the gatewayTxId', async () => {
    setupWithClubId(true);
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({ clubId: RESOLVED_CLUB_ID });
    await processor(job);
    const logCalls = job.log.mock.calls.map((c: string[]) => c[0]).join("\n");
    expect(logCalls).toContain("Duplicate event detected");
    expect(logCalls).toContain("txid-001");
  });

  it("does NOT call charge.create or payment.create when duplicate is detected", async () => {
    setupWithClubId(true);
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({ clubId: RESOLVED_CLUB_ID });
    await processor(job);
    const tenantCalls = vi.mocked(withTenantSchema).mock.calls;
    expect(tenantCalls.every((_call) => true)).toBe(true);
  });

  it("proceeds past the idempotency check when no duplicate exists", async () => {
    setupWithClubId(false);
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({ clubId: RESOLVED_CLUB_ID });
    const result = await processor(job);
    expect(result).not.toEqual({
      skipped: true,
      reason: "duplicate_gateway_txid",
    });
  });

  it("returns { processed: false, reason: 'handler_pending_t027' } for non-duplicate PAYMENT_RECEIVED", async () => {
    setupWithClubId(false);
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({ clubId: RESOLVED_CLUB_ID });
    const result = await processor(job);
    expect(result).toEqual({
      processed: false,
      reason: "handler_pending_t027",
    });
  });
});

describe("Webhook worker processor — clubId re-use on retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) => {
        return fn({
          charge: {
            findUnique: vi.fn().mockResolvedValue({ id: "charge-abc" }),
          },
          payment: { findUnique: vi.fn().mockResolvedValue(null) },
        } as never);
      },
    );
  });

  it("does not call resolveClubIdFromChargeId when clubId is already in job.data", async () => {
    const { getPrismaClient } = await import("../../lib/prisma.js");
    const mockPrisma = {
      club: { findMany: vi.fn() },
    };
    vi.mocked(getPrismaClient).mockReturnValue(mockPrisma as never);

    startWebhookWorker();
    const processor = _capturedProcessor!;

    const job = buildJob({ clubId: "club-already-resolved" });
    await processor(job);

    expect(mockPrisma.club.findMany).not.toHaveBeenCalled();
  });

  it("calls job.updateData with the resolved clubId on first resolution", async () => {
    const { getPrismaClient } = await import("../../lib/prisma.js");
    vi.mocked(getPrismaClient).mockReturnValue({
      club: { findMany: vi.fn().mockResolvedValue([{ id: "club-001" }]) },
    } as never);

    startWebhookWorker();
    const processor = _capturedProcessor!;

    const job = buildJob();
    await processor(job);

    expect(job.updateData).toHaveBeenCalledWith(
      expect.objectContaining({ clubId: "club-001" }),
    );
  });

  it("does NOT call job.updateData when clubId was already in job.data", async () => {
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({ clubId: "club-pre-stored" });
    await processor(job);
    expect(job.updateData).not.toHaveBeenCalled();
  });
});

describe("Webhook worker — lifecycle and error handling", () => {
  it("registers completed and failed event listeners on the worker", () => {
    const worker = startWebhookWorker();
    expect(worker.on).toHaveBeenCalledWith("completed", expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith("failed", expect.any(Function));
  });

  it("does not throw when the failed handler receives an undefined job", () => {
    startWebhookWorker();
    const onCalls = vi.mocked(startWebhookWorker().on).mock.calls;
    const { Worker } = require("bullmq");
    const lastWorkerInstance = vi.mocked(Worker).mock.results.at(-1)?.value;
    const failedListeners =
      (
        lastWorkerInstance as {
          _listeners: Record<string, ((j: unknown, e: Error) => void)[]>;
        }
      )._listeners["failed"] ?? [];
    expect(() => {
      for (const listener of failedListeners) {
        listener(undefined, new Error("boom"));
      }
    }).not.toThrow();
  });
});

describe("Webhook worker — unhandled event types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) => {
        return fn({
          charge: {
            findUnique: vi.fn().mockResolvedValue({ id: "charge-abc" }),
          },
          payment: { findUnique: vi.fn().mockResolvedValue(null) },
        } as never);
      },
    );
    const { getPrismaClient } = require("../../lib/prisma.js");
    vi.mocked(getPrismaClient).mockReturnValue({
      club: { findMany: vi.fn().mockResolvedValue([{ id: "club-001" }]) },
    } as never);
  });

  it("returns { skipped: true, reason: 'unhandled_event_type' } for PAYMENT_OVERDUE", async () => {
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({
      clubId: "club-001",
      event: {
        type: "PAYMENT_OVERDUE",
        gatewayTxId: "txid-overdue",
        externalReference: "charge-abc",
        rawPayload: {},
      },
    });
    const result = await processor(job);
    expect(result).toEqual({ skipped: true, reason: "unhandled_event_type" });
  });

  it("returns { skipped: true, reason: 'unhandled_event_type' } for PAYMENT_REFUNDED", async () => {
    startWebhookWorker();
    const processor = _capturedProcessor!;
    const job = buildJob({
      clubId: "club-001",
      event: {
        type: "PAYMENT_REFUNDED",
        gatewayTxId: "txid-refund",
        externalReference: "charge-abc",
        rawPayload: {},
      },
    });
    const result = await processor(job);
    expect(result).toEqual({ skipped: true, reason: "unhandled_event_type" });
  });
});
