/**
 * webhooks.service.test.ts
 *
 * Unit tests for the functions exported by webhooks.service.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import {
  enqueueWebhookEvent,
  checkAndMarkWebhookDedup,
  ChargeNotFoundError,
  type WebhookJobData,
} from "./webhooks.service.js";
import type { WebhookEvent } from "../payments/gateway.interface.js";

function buildEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    type: "PAYMENT_RECEIVED",
    gatewayTxId: "txid-asaas-001",
    externalReference: "charge-internal-abc",
    amountCents: 14990,
    rawPayload: { event: "PAYMENT_RECEIVED" },
    ...overrides,
  };
}

/**
 * Returns a minimal Queue mock with a tracked `add` spy.
 * The generic type mirrors the real BullMQ Queue<WebhookJobData>.
 */
function buildMockQueue(
  addImpl: () => Promise<unknown> = () => Promise.resolve(undefined),
): Queue<WebhookJobData> {
  return {
    add: vi.fn().mockImplementation(addImpl),
  } as unknown as Queue<WebhookJobData>;
}

function buildMockRedis(setResult: "OK" | null = "OK"): Redis {
  return {
    set: vi.fn().mockResolvedValue(setResult),
  } as unknown as Redis;
}

describe("enqueueWebhookEvent — jobId", () => {
  it("uses a deterministic jobId of the form 'webhook:{gatewayName}:{gatewayTxId}'", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(
      queue,
      "asaas",
      buildEvent({ gatewayTxId: "txid-xyz" }),
    );

    const [, , options] = vi.mocked(queue.add).mock.calls[0]!;
    expect((options as { jobId: string }).jobId).toBe("webhook:asaas:txid-xyz");
  });

  it("jobId changes when gatewayName changes", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(
      queue,
      "pagarme",
      buildEvent({ gatewayTxId: "txid-001" }),
    );

    const [, , options] = vi.mocked(queue.add).mock.calls[0]!;
    expect((options as { jobId: string }).jobId).toBe(
      "webhook:pagarme:txid-001",
    );
  });

  it("jobId changes when gatewayTxId changes", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(
      queue,
      "asaas",
      buildEvent({ gatewayTxId: "different-txid" }),
    );

    const [, , options] = vi.mocked(queue.add).mock.calls[0]!;
    expect((options as { jobId: string }).jobId).toBe(
      "webhook:asaas:different-txid",
    );
  });

  it("two events with the same gatewayName and gatewayTxId produce identical jobIds (deduplication contract)", async () => {
    const queueA = buildMockQueue();
    const queueB = buildMockQueue();
    const event = buildEvent({ gatewayTxId: "dup-txid" });

    await enqueueWebhookEvent(queueA, "asaas", event);
    await enqueueWebhookEvent(queueB, "asaas", event);

    const idA = (vi.mocked(queueA.add).mock.calls[0]![2] as { jobId: string })
      .jobId;
    const idB = (vi.mocked(queueB.add).mock.calls[0]![2] as { jobId: string })
      .jobId;
    expect(idA).toBe(idB);
  });
});

describe("enqueueWebhookEvent — job name", () => {
  it("uses the job name 'process-webhook'", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [jobName] = vi.mocked(queue.add).mock.calls[0]!;
    expect(jobName).toBe("process-webhook");
  });
});

describe("enqueueWebhookEvent — job data", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T10:30:00.000Z"));
  });

  it("includes the gatewayName in job data", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).gatewayName).toBe("asaas");

    vi.useRealTimers();
  });

  it("includes the normalised event object unchanged in job data", async () => {
    const queue = buildMockQueue();
    const event = buildEvent({
      gatewayTxId: "txid-check",
      externalReference: "charge-check-001",
      amountCents: 9900,
    });
    await enqueueWebhookEvent(queue, "asaas", event);

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).event).toStrictEqual(event);

    vi.useRealTimers();
  });

  it("sets receivedAt to the current ISO timestamp at enqueue time", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).receivedAt).toBe(
      "2025-06-15T10:30:00.000Z",
    );

    vi.useRealTimers();
  });

  it("receivedAt is a parseable ISO 8601 date string", async () => {
    vi.useRealTimers();
    const before = Date.now();
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());
    const after = Date.now();

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    const receivedAt = (data as WebhookJobData).receivedAt;
    const parsed = new Date(receivedAt).getTime();

    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it("does NOT include a clubId in job data on initial enqueue", async () => {
    vi.useRealTimers();
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).clubId).toBeUndefined();
  });

  it("passes UNKNOWN event type through to job data unchanged", async () => {
    vi.useRealTimers();
    const queue = buildMockQueue();
    const event = buildEvent({ type: "UNKNOWN" });
    await enqueueWebhookEvent(queue, "asaas", event);

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).event.type).toBe("UNKNOWN");
  });

  it("passes PAYMENT_OVERDUE event type through to job data unchanged", async () => {
    vi.useRealTimers();
    const queue = buildMockQueue();
    const event = buildEvent({
      type: "PAYMENT_OVERDUE",
      externalReference: undefined,
    });
    await enqueueWebhookEvent(queue, "asaas", event);

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).event.type).toBe("PAYMENT_OVERDUE");
  });
});

describe("enqueueWebhookEvent — BullMQ options", () => {
  it("sets attempts to 3", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [, , options] = vi.mocked(queue.add).mock.calls[0]!;
    expect((options as { attempts: number }).attempts).toBe(3);
  });

  it("uses exponential backoff with 1 000 ms initial delay", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [, , options] = vi.mocked(queue.add).mock.calls[0]!;
    expect(
      (options as { backoff: { type: string; delay: number } }).backoff,
    ).toEqual({
      type: "exponential",
      delay: 1_000,
    });
  });

  it("removes completed jobs after 24 hours (86 400 seconds)", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [, , options] = vi.mocked(queue.add).mock.calls[0]!;
    expect(
      (options as { removeOnComplete: { age: number } }).removeOnComplete,
    ).toEqual({ age: 86_400 });
  });

  it("retains failed jobs for 7 days (604 800 seconds)", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());

    const [, , options] = vi.mocked(queue.add).mock.calls[0]!;
    expect((options as { removeOnFail: { age: number } }).removeOnFail).toEqual(
      { age: 7 * 86_400 },
    );
  });
});

describe("enqueueWebhookEvent — call contract", () => {
  it("calls queue.add exactly once per invocation", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent());
    expect(vi.mocked(queue.add)).toHaveBeenCalledOnce();
  });

  it("resolves to undefined (void return)", async () => {
    const queue = buildMockQueue();
    const result = await enqueueWebhookEvent(queue, "asaas", buildEvent());
    expect(result).toBeUndefined();
  });

  it("propagates a rejection from queue.add (infrastructure failure)", async () => {
    const queue = buildMockQueue(() =>
      Promise.reject(new Error("Redis connection lost")),
    );
    await expect(
      enqueueWebhookEvent(queue, "asaas", buildEvent()),
    ).rejects.toThrow("Redis connection lost");
  });

  it("does not swallow queue.add errors — the caller receives them", async () => {
    const queue = buildMockQueue(() => Promise.reject(new Error("Queue full")));
    let caught: Error | undefined;
    try {
      await enqueueWebhookEvent(queue, "asaas", buildEvent());
    } catch (err) {
      caught = err as Error;
    }
    expect(caught?.message).toBe("Queue full");
  });
});

describe("enqueueWebhookEvent — rawPayload fidelity", () => {
  it("preserves the rawPayload object reference in job data", async () => {
    const queue = buildMockQueue();
    const rawPayload = {
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_001" },
    };
    const event = buildEvent({ rawPayload });

    await enqueueWebhookEvent(queue, "asaas", event);

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).event.rawPayload).toStrictEqual(rawPayload);
  });

  it("preserves an empty rawPayload object without modification", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(queue, "asaas", buildEvent({ rawPayload: {} }));

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).event.rawPayload).toStrictEqual({});
  });
});

describe("enqueueWebhookEvent — amountCents in event data", () => {
  it("passes through a defined amountCents value", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(
      queue,
      "asaas",
      buildEvent({ amountCents: 9999 }),
    );

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).event.amountCents).toBe(9999);
  });

  it("passes through an undefined amountCents without coercing it", async () => {
    const queue = buildMockQueue();
    await enqueueWebhookEvent(
      queue,
      "asaas",
      buildEvent({ amountCents: undefined }),
    );

    const [, data] = vi.mocked(queue.add).mock.calls[0]!;
    expect((data as WebhookJobData).event.amountCents).toBeUndefined();
  });
});

describe("checkAndMarkWebhookDedup()", () => {
  it("returns true when Redis SET NX succeeds (new event)", async () => {
    const redis = buildMockRedis("OK");
    const result = await checkAndMarkWebhookDedup(redis, "asaas", "txid-001");
    expect(result).toBe(true);
  });

  it("calls SET with the correct key format webhook:dedup:{gateway}:{txId}", async () => {
    const redis = buildMockRedis("OK");
    await checkAndMarkWebhookDedup(redis, "asaas", "txid-abc");
    expect(redis.set).toHaveBeenCalledWith(
      "webhook:dedup:asaas:txid-abc",
      "1",
      "EX",
      86400,
      "NX",
    );
  });

  it("calls SET with TTL of exactly 86400 seconds (24 hours)", async () => {
    const redis = buildMockRedis("OK");
    await checkAndMarkWebhookDedup(redis, "pagarme", "txid-xyz");
    const args = (redis.set as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(args[2]).toBe("EX");
    expect(args[3]).toBe(86400);
    expect(args[4]).toBe("NX");
  });

  it("returns false when Redis SET NX returns null (duplicate)", async () => {
    const redis = buildMockRedis(null);
    const result = await checkAndMarkWebhookDedup(redis, "asaas", "txid-dup");
    expect(result).toBe(false);
  });

  it("returns true without calling Redis when gatewayTxId is empty string", async () => {
    const redis = buildMockRedis("OK");
    const result = await checkAndMarkWebhookDedup(redis, "asaas", "");
    expect(result).toBe(true);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("key includes gatewayName to prevent cross-gateway collisions", async () => {
    const asaasRedis = buildMockRedis("OK");
    const pagarmeRedis = buildMockRedis("OK");
    await checkAndMarkWebhookDedup(asaasRedis, "asaas", "txid-shared");
    await checkAndMarkWebhookDedup(pagarmeRedis, "pagarme", "txid-shared");
    const asaasKey = (asaasRedis.set as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    const pagarmeKey = (pagarmeRedis.set as ReturnType<typeof vi.fn>).mock
      .calls[0]![0];
    expect(asaasKey).not.toBe(pagarmeKey);
    expect(asaasKey).toContain("asaas");
    expect(pagarmeKey).toContain("pagarme");
  });

  it("two calls with the same args produce the same Redis key (deterministic)", async () => {
    const redis1 = buildMockRedis("OK");
    const redis2 = buildMockRedis("OK");
    await checkAndMarkWebhookDedup(redis1, "asaas", "txid-det");
    await checkAndMarkWebhookDedup(redis2, "asaas", "txid-det");
    const key1 = (redis1.set as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const key2 = (redis2.set as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(key1).toBe(key2);
  });
});

describe("ChargeNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new ChargeNotFoundError("ch-001")).toBeInstanceOf(Error);
  });

  it("has name 'ChargeNotFoundError'", () => {
    expect(new ChargeNotFoundError("ch-001").name).toBe("ChargeNotFoundError");
  });

  it("message includes the chargeId", () => {
    expect(new ChargeNotFoundError("ch-xyz").message).toContain("ch-xyz");
  });

  it("message matches the expected template exactly", () => {
    expect(new ChargeNotFoundError("ch-123").message).toBe(
      `Charge "ch-123" not found in tenant schema`,
    );
  });

  it("two instances with different chargeIds have different messages", () => {
    const a = new ChargeNotFoundError("ch-aaa");
    const b = new ChargeNotFoundError("ch-bbb");
    expect(a.message).not.toBe(b.message);
  });

  it("can be caught as a plain Error", () => {
    expect(() => {
      throw new ChargeNotFoundError("ch-catch");
    }).toThrow(Error);
  });

  it("can be identified by name in a catch block (no instanceof needed)", () => {
    let caught: Error | undefined;
    try {
      throw new ChargeNotFoundError("ch-name-check");
    } catch (err) {
      caught = err as Error;
    }
    expect(caught?.name).toBe("ChargeNotFoundError");
  });
});
