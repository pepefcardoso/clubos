import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasRecentMessage,
  countRecentFailedWhatsAppMessages,
} from "./messages.service.js";

const mockFindFirst = vi.fn();
const mockCount = vi.fn();

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) => {
      return fn({
        message: {
          findFirst: mockFindFirst,
          count: mockCount,
        },
      });
    },
  ),
}));

const MOCK_PRISMA = {} as never;

describe("hasRecentMessage()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when a non-FAILED message is found", async () => {
    mockFindFirst.mockResolvedValue({ id: "msg-1" });

    const result = await hasRecentMessage(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
    );

    expect(result).toBe(true);
  });

  it("returns false when no message is found", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await hasRecentMessage(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
    );

    expect(result).toBe(false);
  });

  it("passes channel filter when provided", async () => {
    mockFindFirst.mockResolvedValue(null);

    await hasRecentMessage(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
      20,
      "EMAIL",
    );

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ channel: "EMAIL" }),
      }),
    );
  });

  it("omits channel filter when not provided (backward-compatible)", async () => {
    mockFindFirst.mockResolvedValue(null);

    await hasRecentMessage(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
    );

    const callArgs = mockFindFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs?.where).not.toHaveProperty("channel");
  });

  it("finds an EMAIL message when channel=EMAIL is specified", async () => {
    mockFindFirst.mockResolvedValue({ id: "email-msg-1" });

    const result = await hasRecentMessage(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
      20,
      "EMAIL",
    );

    expect(result).toBe(true);
  });

  it("does not find a WHATSAPP message when channel=EMAIL is specified", async () => {
    mockFindFirst.mockResolvedValue(null);

    const result = await hasRecentMessage(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
      20,
      "EMAIL",
    );

    expect(result).toBe(false);
  });

  it("uses the provided windowHours to compute the since timestamp", async () => {
    mockFindFirst.mockResolvedValue(null);

    const before = Date.now();
    await hasRecentMessage(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
      48,
    );
    const after = Date.now();

    const callArgs = mockFindFirst.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date } };
    };
    const gte = callArgs?.where?.createdAt?.gte?.getTime() ?? 0;

    const expectedMin = before - 48 * 3600 * 1000;
    const expectedMax = after - 48 * 3600 * 1000;

    expect(gte).toBeGreaterThanOrEqual(expectedMin);
    expect(gte).toBeLessThanOrEqual(expectedMax);
  });
});

describe("countRecentFailedWhatsAppMessages()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 when no failed messages exist", async () => {
    mockCount.mockResolvedValue(0);

    const result = await countRecentFailedWhatsAppMessages(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
    );

    expect(result).toBe(0);
  });

  it("returns the correct count within the window", async () => {
    mockCount.mockResolvedValue(2);

    const result = await countRecentFailedWhatsAppMessages(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
    );

    expect(result).toBe(2);
  });

  it("filters by WHATSAPP channel and FAILED status", async () => {
    mockCount.mockResolvedValue(0);

    await countRecentFailedWhatsAppMessages(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
    );

    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: "WHATSAPP",
          status: "FAILED",
        }),
      }),
    );
  });

  it("uses the provided windowHours to compute the since timestamp", async () => {
    mockCount.mockResolvedValue(0);

    const before = Date.now();
    await countRecentFailedWhatsAppMessages(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
      72,
    );
    const after = Date.now();

    const callArgs = mockCount.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date } };
    };
    const gte = callArgs?.where?.createdAt?.gte?.getTime() ?? 0;

    const expectedMin = before - 72 * 3600 * 1000;
    const expectedMax = after - 72 * 3600 * 1000;

    expect(gte).toBeGreaterThanOrEqual(expectedMin);
    expect(gte).toBeLessThanOrEqual(expectedMax);
  });

  it("defaults to 48h window when windowHours is omitted", async () => {
    mockCount.mockResolvedValue(0);

    const before = Date.now();
    await countRecentFailedWhatsAppMessages(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "charge_reminder_d3",
    );
    const after = Date.now();

    const callArgs = mockCount.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date } };
    };
    const gte = callArgs?.where?.createdAt?.gte?.getTime() ?? 0;

    const expectedMin = before - 48 * 3600 * 1000;
    const expectedMax = after - 48 * 3600 * 1000;

    expect(gte).toBeGreaterThanOrEqual(expectedMin);
    expect(gte).toBeLessThanOrEqual(expectedMax);
  });

  it("does not count FAILED EMAIL messages (channel filter is WHATSAPP only)", async () => {
    mockCount.mockResolvedValue(0);

    await countRecentFailedWhatsAppMessages(
      MOCK_PRISMA,
      "club-1",
      "member-1",
      "overdue_notice",
    );

    const callArgs = mockCount.mock.calls[0]?.[0] as {
      where: { channel: string };
    };
    expect(callArgs?.where?.channel).toBe("WHATSAPP");
  });
});
