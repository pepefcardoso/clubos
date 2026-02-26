import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBillingKey, SYSTEM_ACTOR_ID } from './charge-dispatch.worker.js';

describe('getBillingKey', () => {
  it('returns current UTC month key when no argument provided', () => {
    const now = new Date();
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    expect(getBillingKey()).toBe(expected);
  });

  it("returns '2025-03' for a March ISO string", () => {
    expect(getBillingKey('2025-03-01T00:00:00.000Z')).toBe('2025-03');
  });

  it("returns '2025-03' regardless of the day in the ISO string", () => {
    expect(getBillingKey('2025-03-15T12:34:56.000Z')).toBe('2025-03');
  });

  it("returns '2025-11' for November", () => {
    expect(getBillingKey('2025-11-28T00:00:00.000Z')).toBe('2025-11');
  });

  it("returns '2025-01' for January (single-digit month is zero-padded)", () => {
    expect(getBillingKey('2025-01-01T00:00:00.000Z')).toBe('2025-01');
  });

  it("returns '2024-02' for February in a leap year", () => {
    expect(getBillingKey('2024-02-29T00:00:00.000Z')).toBe('2024-02');
  });

  it('produces a stable key for the same period regardless of day', () => {
    const key1 = getBillingKey('2025-06-01T00:00:00.000Z');
    const key2 = getBillingKey('2025-06-30T23:59:59.999Z');
    expect(key1).toBe(key2);
    expect(key1).toBe('2025-06');
  });
});

describe('SYSTEM_ACTOR_ID', () => {
  it("is 'system:cron' for audit log distinguishability", () => {
    expect(SYSTEM_ACTOR_ID).toBe('system:cron');
  });
});

describe('per-club jobId deduplication pattern', () => {
  it('produces the same jobId for the same club + billing period', () => {
    const clubId = 'abc123def456ghi789jkl0';
    const billingKey = getBillingKey('2025-03-01T00:00:00.000Z');
    const jobId1 = `generate-${clubId}-${billingKey}`;
    const jobId2 = `generate-${clubId}-${billingKey}`;
    expect(jobId1).toBe(jobId2);
  });

  it('produces different jobIds for different clubs in the same period', () => {
    const billingKey = getBillingKey('2025-03-01T00:00:00.000Z');
    const jobId1 = `generate-club-aaa-${billingKey}`;
    const jobId2 = `generate-club-bbb-${billingKey}`;
    expect(jobId1).not.toBe(jobId2);
  });

  it('produces different jobIds for the same club in different billing periods', () => {
    const clubId = 'abc123def456ghi789jkl0';
    const jobId1 = `generate-${clubId}-${getBillingKey('2025-02-01T00:00:00.000Z')}`;
    const jobId2 = `generate-${clubId}-${getBillingKey('2025-03-01T00:00:00.000Z')}`;
    expect(jobId1).not.toBe(jobId2);
    expect(jobId1).toBe(`generate-${clubId}-2025-02`);
    expect(jobId2).toBe(`generate-${clubId}-2025-03`);
  });
});