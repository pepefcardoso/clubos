import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEventReport } from "./reports.service.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    (_p: unknown, _c: string, fn: (tx: unknown) => unknown) => fn(makeTx()),
  ),
}));

vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertEventExists: vi.fn().mockResolvedValue(undefined),
}));

import { withTenantSchema } from "../../../lib/prisma.js";

const CLUB_ID = "clubabc123456789012345";
const EVENT_ID = "evt_01";
const ACTOR_ID = "user-admin-001";

const BASE_SECTOR_ROW = {
  id: "sec_01",
  name: "Arquibancada",
  capacity: 200,
  sold: 0,
  priceCents: 5000,
  tickets: [] as Array<{ checkedIn: boolean }>,
};

const BASE_EVENT = {
  id: EVENT_ID,
  opponent: "Flamengo",
  eventDate: new Date("2025-08-10T18:00:00Z"),
  venue: "Estádio Municipal",
  status: "COMPLETED",
  sectors: [BASE_SECTOR_ROW],
  posSales: [] as Array<{ amountCents: number }>,
};

function makeTx(eventOverride?: Partial<typeof BASE_EVENT>) {
  const event = { ...BASE_EVENT, ...eventOverride };
  return {
    event: {
      findUnique: vi.fn().mockResolvedValue(event),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

beforeEach(() => {
  vi.mocked(withTenantSchema).mockImplementation((_p, _c, fn) =>
    fn(makeTx() as unknown as Parameters<typeof fn>[0]),
  );
});

describe("getEventReport — revenue calculations [FIN]", () => {
  it("totalTicketRevenueCents = sold × priceCents per sector (integer) [FIN]", async () => {
    const sectors = [
      {
        ...BASE_SECTOR_ROW,
        id: "s1",
        priceCents: 5000,
        tickets: [{ checkedIn: true }, { checkedIn: false }],
      },
      {
        ...BASE_SECTOR_ROW,
        id: "s2",
        priceCents: 3000,
        tickets: [{ checkedIn: true }],
      },
    ];
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(makeTx({ sectors }) as unknown as Parameters<typeof fn>[0]),
    );

    const result = await getEventReport(
      {} as never,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
    );

    expect(result.totalTicketRevenueCents).toBe(13_000);
    expect(Number.isInteger(result.totalTicketRevenueCents)).toBe(true);
  });

  it("totalPosSalesCents sums all PoS sale amounts (integer) [FIN]", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(
        makeTx({
          posSales: [{ amountCents: 1500 }, { amountCents: 2500 }],
        }) as unknown as Parameters<typeof fn>[0],
      ),
    );

    const result = await getEventReport(
      {} as never,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
    );

    expect(result.totalPosSalesCents).toBe(4_000);
    expect(Number.isInteger(result.totalPosSalesCents)).toBe(true);
  });

  it("totalCombinedCents = totalTicketRevenueCents + totalPosSalesCents [FIN]", async () => {
    const sectors = [
      { ...BASE_SECTOR_ROW, priceCents: 5000, tickets: [{ checkedIn: true }] },
    ];
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(
        makeTx({
          sectors,
          posSales: [{ amountCents: 2000 }],
        }) as unknown as Parameters<typeof fn>[0],
      ),
    );

    const result = await getEventReport(
      {} as never,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
    );

    expect(result.totalCombinedCents).toBe(
      result.totalTicketRevenueCents + result.totalPosSalesCents,
    );
    expect(Number.isInteger(result.totalCombinedCents)).toBe(true);
  });

  it("totalCheckIns counts only checkedIn:true tickets", async () => {
    const sectors = [
      {
        ...BASE_SECTOR_ROW,
        priceCents: 5000,
        tickets: [
          { checkedIn: true },
          { checkedIn: true },
          { checkedIn: false },
        ],
      },
    ];
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(makeTx({ sectors }) as unknown as Parameters<typeof fn>[0]),
    );

    const result = await getEventReport(
      {} as never,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
    );

    expect(result.totalCheckIns).toBe(2);
    expect(result.totalNoShows).toBe(1);
  });

  it("occupancyPct is 0 when no tickets sold (avoids division by zero)", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(
        makeTx({
          sectors: [{ ...BASE_SECTOR_ROW, tickets: [] }],
        }) as unknown as Parameters<typeof fn>[0],
      ),
    );

    const result = await getEventReport(
      {} as never,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
    );

    expect(result.overallOccupancyPct).toBe(0);
  });

  it("returns 0 totalTicketRevenueCents and totalPosSalesCents when no sales", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(
        makeTx({
          sectors: [{ ...BASE_SECTOR_ROW, tickets: [] }],
          posSales: [],
        }) as unknown as Parameters<typeof fn>[0],
      ),
    );

    const result = await getEventReport(
      {} as never,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
    );

    expect(result.totalTicketRevenueCents).toBe(0);
    expect(result.totalPosSalesCents).toBe(0);
    expect(result.totalCombinedCents).toBe(0);
  });
});

describe("getEventReport — integrityHash", () => {
  it("returns a 64-character hex SHA-256 hash", async () => {
    const result = await getEventReport(
      {} as never,
      CLUB_ID,
      EVENT_ID,
      ACTOR_ID,
    );

    expect(result.integrityHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces identical hash for identical revenue on same event", async () => {
    const sectors = [
      { ...BASE_SECTOR_ROW, priceCents: 5000, tickets: [{ checkedIn: true }] },
    ];
    vi.mocked(withTenantSchema)
      .mockImplementationOnce((_p, _c, fn) =>
        fn(makeTx({ sectors }) as unknown as Parameters<typeof fn>[0]),
      )
      .mockImplementationOnce((_p, _c, fn) =>
        fn(makeTx({ sectors }) as unknown as Parameters<typeof fn>[0]),
      );

    const r1 = await getEventReport({} as never, CLUB_ID, EVENT_ID, ACTOR_ID);
    const r2 = await getEventReport({} as never, CLUB_ID, EVENT_ID, ACTOR_ID);

    expect(r1.integrityHash).toBe(r2.integrityHash);
  });
});

describe("getEventReport — audit log", () => {
  it("creates audit log with action EVENT_REPORT_GENERATED", async () => {
    const tx = makeTx();
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await getEventReport({} as never, CLUB_ID, EVENT_ID, ACTOR_ID);

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: ACTOR_ID,
          action: "EVENT_REPORT_GENERATED",
          entityId: EVENT_ID,
        }),
      }),
    );
  });

  it("audit metadata includes integrityHash and revenue totals [FIN]", async () => {
    const sectors = [
      { ...BASE_SECTOR_ROW, priceCents: 5000, tickets: [{ checkedIn: false }] },
    ];
    const tx = makeTx({ sectors });
    vi.mocked(withTenantSchema).mockImplementationOnce((_p, _c, fn) =>
      fn(tx as unknown as Parameters<typeof fn>[0]),
    );

    await getEventReport({} as never, CLUB_ID, EVENT_ID, ACTOR_ID);

    const call = tx.auditLog.create.mock.calls[0]![0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(typeof call.data.metadata["totalTicketRevenueCents"]).toBe("number");
    expect(typeof call.data.metadata["integrityHash"]).toBe("string");
  });
});
