import { describe, it, expect, vi, beforeEach } from "vitest";

let _mockTx: ReturnType<typeof buildMockTx>;

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_mockTx),
  ),
}));

import { listMessages, hasRecentMessage } from "./messages.service.js";

function buildMockTx(
  overrides: {
    messageFindMany?: object[];
    messageCount?: number;
    messageFindFirst?: object | null;
  } = {},
) {
  return {
    message: {
      findMany: vi.fn().mockResolvedValue(overrides.messageFindMany ?? []),
      count: vi.fn().mockResolvedValue(overrides.messageCount ?? 0),
      findFirst: vi
        .fn()
        .mockResolvedValue(
          overrides.messageFindFirst !== undefined
            ? overrides.messageFindFirst
            : null,
        ),
    },
  };
}

function setMockTx(tx: ReturnType<typeof buildMockTx>) {
  _mockTx = tx;
}

const PRISMA_STUB = {} as never;
const CLUB_ID = "club-test-001";

const MOCK_MESSAGE = {
  id: "msg-001",
  memberId: "member-001",
  channel: "WHATSAPP" as const,
  template: "charge_reminder_d3",
  status: "SENT" as const,
  sentAt: new Date("2025-03-28T11:00:00.000Z"),
  failReason: null,
  createdAt: new Date("2025-03-28T11:00:00.000Z"),
};

describe("listMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MS-1: returns paginated array and correct total", async () => {
    const tx = buildMockTx({
      messageFindMany: [MOCK_MESSAGE],
      messageCount: 42,
    });
    setMockTx(tx);

    const result = await listMessages(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(42);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("MS-2: filters by memberId", async () => {
    const tx = buildMockTx({ messageFindMany: [], messageCount: 0 });
    setMockTx(tx);

    await listMessages(PRISMA_STUB, CLUB_ID, {
      memberId: "member-xyz",
      page: 1,
      limit: 20,
    });

    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberId: "member-xyz" }),
      }),
    );
  });

  it("MS-3: filters by status", async () => {
    const tx = buildMockTx({ messageFindMany: [], messageCount: 0 });
    setMockTx(tx);

    await listMessages(PRISMA_STUB, CLUB_ID, {
      status: "FAILED",
      page: 1,
      limit: 20,
    });

    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("MS-4: filters by channel", async () => {
    const tx = buildMockTx({ messageFindMany: [], messageCount: 0 });
    setMockTx(tx);

    await listMessages(PRISMA_STUB, CLUB_ID, {
      channel: "EMAIL",
      page: 1,
      limit: 20,
    });

    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ channel: "EMAIL" }),
      }),
    );
  });

  it("MS-5: filters by dateFrom and dateTo", async () => {
    const tx = buildMockTx({ messageFindMany: [], messageCount: 0 });
    setMockTx(tx);

    await listMessages(PRISMA_STUB, CLUB_ID, {
      dateFrom: "2025-03-01T00:00:00.000Z",
      dateTo: "2025-03-31T23:59:59.000Z",
      page: 1,
      limit: 20,
    });

    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2025-03-01T00:00:00.000Z"),
            lte: new Date("2025-03-31T23:59:59.000Z"),
          },
        }),
      }),
    );
  });

  it("MS-6: returns empty data array when no records exist", async () => {
    const tx = buildMockTx({ messageFindMany: [], messageCount: 0 });
    setMockTx(tx);

    const result = await listMessages(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("applies correct skip/take for page 2", async () => {
    const tx = buildMockTx({ messageFindMany: [], messageCount: 50 });
    setMockTx(tx);

    await listMessages(PRISMA_STUB, CLUB_ID, { page: 2, limit: 10 });

    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
});

describe("hasRecentMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MS-7: returns true when a SENT message exists within window", async () => {
    const tx = buildMockTx({
      messageFindFirst: { id: "msg-recent" },
    });
    setMockTx(tx);

    const result = await hasRecentMessage(
      PRISMA_STUB,
      CLUB_ID,
      "member-001",
      "charge_reminder_d3",
    );

    expect(result).toBe(true);
  });

  it("MS-8: returns false when only FAILED messages exist (excluded by filter)", async () => {
    const tx = buildMockTx({ messageFindFirst: null });
    setMockTx(tx);

    const result = await hasRecentMessage(
      PRISMA_STUB,
      CLUB_ID,
      "member-001",
      "charge_reminder_d3",
    );

    expect(result).toBe(false);
    expect(tx.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: "FAILED" },
        }),
      }),
    );
  });

  it("MS-9: returns false when no message exists within the window", async () => {
    const tx = buildMockTx({ messageFindFirst: null });
    setMockTx(tx);

    const result = await hasRecentMessage(
      PRISMA_STUB,
      CLUB_ID,
      "member-001",
      "charge_reminder_d3",
      20,
    );

    expect(result).toBe(false);
  });

  it("MS-10: returns true for PENDING status (in-flight guard)", async () => {
    const tx = buildMockTx({
      messageFindFirst: { id: "msg-pending" },
    });
    setMockTx(tx);

    const result = await hasRecentMessage(
      PRISMA_STUB,
      CLUB_ID,
      "member-001",
      "charge_reminder_d0",
    );

    expect(result).toBe(true);
  });

  it("MS-11: respects custom windowHours argument", async () => {
    const tx = buildMockTx({ messageFindFirst: null });
    setMockTx(tx);

    const before = Date.now();
    await hasRecentMessage(
      PRISMA_STUB,
      CLUB_ID,
      "member-001",
      "overdue_notice",
      48,
    );
    const after = Date.now();

    const call = tx.message.findFirst.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date } };
    };
    const gte = call.where.createdAt.gte.getTime();

    const expected = before - 48 * 60 * 60 * 1000;
    expect(gte).toBeGreaterThanOrEqual(expected - 100);
    expect(gte).toBeLessThanOrEqual(after - 48 * 60 * 60 * 1000 + 100);
  });
});
