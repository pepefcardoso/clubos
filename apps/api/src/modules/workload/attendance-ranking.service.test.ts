import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { getAttendanceRanking } from "./workload.service.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";

const makeRawRow = (overrides: Record<string, unknown> = {}) => ({
  athleteId: "ath_001",
  name: "Carlos Eduardo",
  position: "Atacante",
  session_count: 5,
  training_days: 4,
  last_session_date: new Date("2024-06-10"),
  acwr_ratio: "1.15",
  risk_zone: "optimal",
  acwr_last_refreshed_at: new Date("2024-06-10"),
  ...overrides,
});

describe("getAttendanceRanking()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it("returns empty athletes array when no active athletes exist", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, {
      days: 30,
    });

    expect(result.athletes).toHaveLength(0);
    expect(result.windowDays).toBe(30);
    expect(result.acwrLastRefreshedAt).toBeNull();
  });

  it("returns athletes sorted descending by sessionCount", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      makeRawRow({ athleteId: "ath_001", name: "Carlos", session_count: 8 }),
      makeRawRow({ athleteId: "ath_002", name: "Maria", session_count: 5 }),
      makeRawRow({ athleteId: "ath_003", name: "João", session_count: 2 }),
    ]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(result.athletes).toHaveLength(3);
    expect(result.athletes[0]!.sessionCount).toBe(8);
    expect(result.athletes[1]!.sessionCount).toBe(5);
    expect(result.athletes[2]!.sessionCount).toBe(2);
  });

  it("correctly maps all scalar fields from raw row", async () => {
    const rawRow = makeRawRow({
      athleteId: "ath_001",
      name: "Carlos Eduardo",
      position: "Goleiro",
      session_count: 10,
      training_days: 9,
      last_session_date: new Date("2024-06-15"),
      acwr_ratio: "1.20",
      risk_zone: "high",
      acwr_last_refreshed_at: new Date("2024-06-15"),
    });
    vi.mocked(prisma.$queryRaw).mockResolvedValue([rawRow]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });
    const athlete = result.athletes[0]!;

    expect(athlete.athleteId).toBe("ath_001");
    expect(athlete.name).toBe("Carlos Eduardo");
    expect(athlete.position).toBe("Goleiro");
    expect(athlete.sessionCount).toBe(10);
    expect(athlete.trainingDays).toBe(9);
    expect(athlete.lastSessionDate).toEqual(new Date("2024-06-15"));
    expect(athlete.acwrRatio).toBe(1.2);
    expect(athlete.riskZone).toBe("high");
  });

  it("returns riskZone: null for athletes with no ACWR data", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      makeRawRow({
        acwr_ratio: null,
        risk_zone: null,
        acwr_last_refreshed_at: null,
      }),
    ]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });
    const athlete = result.athletes[0]!;

    expect(athlete.acwrRatio).toBeNull();
    expect(athlete.riskZone).toBeNull();
  });

  it("returns acwrLastRefreshedAt: null when the MV has no rows", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(result.acwrLastRefreshedAt).toBeNull();
  });

  it("returns acwrLastRefreshedAt from the first row when present", async () => {
    const refreshDate = new Date("2024-06-10T08:00:00Z");
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      makeRawRow({ acwr_last_refreshed_at: refreshDate }),
    ]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(result.acwrLastRefreshedAt).toEqual(refreshDate);
  });

  it("sets windowDays from the params", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 7 });

    expect(result.windowDays).toBe(7);
  });

  it("handles null position gracefully", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      makeRawRow({ position: null }),
    ]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(result.athletes[0]!.position).toBeNull();
  });

  it("handles null lastSessionDate (athlete with no sessions in window)", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      makeRawRow({
        session_count: 0,
        training_days: 0,
        last_session_date: null,
      }),
    ]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(result.athletes[0]!.lastSessionDate).toBeNull();
    expect(result.athletes[0]!.sessionCount).toBe(0);
  });

  it("maps NUMERIC acwr_ratio string to JS number", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      makeRawRow({ acwr_ratio: "0.85" }),
    ]);

    const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(typeof result.athletes[0]!.acwrRatio).toBe("number");
    expect(result.athletes[0]!.acwrRatio).toBe(0.85);
  });

  it("calls withTenantSchema ($transaction) once", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("calls $executeRawUnsafe with the correct tenant schema name", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining(`clube_${CLUB_ID}`),
    );
  });

  it("re-throws database errors from $queryRaw", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error("relation does not exist"),
    );

    await expect(
      getAttendanceRanking(prisma, CLUB_ID, { days: 30 }),
    ).rejects.toThrow("relation does not exist");
  });

  it("all risk zones are mapped correctly", async () => {
    const zones = [
      "insufficient_data",
      "low",
      "optimal",
      "high",
      "very_high",
    ] as const;

    for (const zone of zones) {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        makeRawRow({ risk_zone: zone }),
      ]);

      const result = await getAttendanceRanking(prisma, CLUB_ID, { days: 30 });
      expect(result.athletes[0]!.riskZone).toBe(zone);
    }
  });
});
