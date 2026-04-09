import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  listInjuryProtocols,
  getInjuryProtocolById,
  InjuryProtocolNotFoundError,
} from "./injury-protocols.service.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    injuryProtocol: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    ...overrides,
  };
  return base as unknown as PrismaClient;
}

const CLUB_ID = "testclubid0000000001";
const PROTOCOL_ID = "proto_hamstring_g1";

const PROTOCOL_ROW = {
  id: PROTOCOL_ID,
  name: "Hamstring Strain — Grade I",
  structure: "Hamstring",
  grade: "GRADE_1",
  durationDays: 7,
  source: "FIFA Medical 2023",
  steps: [
    { day: "1-2", activity: "PRICE protocol, cryotherapy 15min × 3/day" },
    { day: "3-5", activity: "Light stretching, pain-free ROM exercises" },
    { day: "6-7", activity: "Progressive running, return to full training" },
  ],
  isActive: true,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-01-01T00:00:00Z"),
};

const SUMMARY_ROW = {
  id: PROTOCOL_ID,
  name: PROTOCOL_ROW.name,
  structure: PROTOCOL_ROW.structure,
  grade: PROTOCOL_ROW.grade,
  durationDays: PROTOCOL_ROW.durationDays,
  isActive: true,
};

describe("InjuryProtocolNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new InjuryProtocolNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new InjuryProtocolNotFoundError().name).toBe(
      "InjuryProtocolNotFoundError",
    );
  });

  it("carries a Portuguese message mentioning Protocolo", () => {
    expect(new InjuryProtocolNotFoundError().message).toMatch(/Protocolo/);
  });

  it("can be caught via instanceof", () => {
    expect(() => {
      throw new InjuryProtocolNotFoundError();
    }).toThrowError(InjuryProtocolNotFoundError);
  });
});

describe("listInjuryProtocols()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.injuryProtocol.findMany).mockResolvedValue([
      SUMMARY_ROW,
    ] as never);
    vi.mocked(prisma.injuryProtocol.count).mockResolvedValue(1);
  });

  it("returns paginated summaries without steps field", async () => {
    const result = await listInjuryProtocols(prisma, CLUB_ID, {
      page: 1,
      limit: 50,
    });
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty("steps");
  });

  it("returns correct pagination metadata", async () => {
    const result = await listInjuryProtocols(prisma, CLUB_ID, {
      page: 2,
      limit: 10,
    });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it("defaults isActive to true", async () => {
    await listInjuryProtocols(prisma, CLUB_ID, { page: 1, limit: 50 });
    const call = vi.mocked(prisma.injuryProtocol.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ isActive: true });
  });

  it("respects explicit isActive: false from params", async () => {
    vi.mocked(prisma.injuryProtocol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.injuryProtocol.count).mockResolvedValue(0);
    await listInjuryProtocols(prisma, CLUB_ID, {
      page: 1,
      limit: 50,
      isActive: false,
    });
    const call = vi.mocked(prisma.injuryProtocol.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ isActive: false });
  });

  it("filters by structure", async () => {
    await listInjuryProtocols(prisma, CLUB_ID, {
      page: 1,
      limit: 50,
      structure: "Hamstring",
    });
    const call = vi.mocked(prisma.injuryProtocol.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ structure: "Hamstring" });
  });

  it("filters by grade", async () => {
    await listInjuryProtocols(prisma, CLUB_ID, {
      page: 1,
      limit: 50,
      grade: "GRADE_2",
    });
    const call = vi.mocked(prisma.injuryProtocol.findMany).mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({ grade: "GRADE_2" });
  });

  it("orders by structure asc, then durationDays asc", async () => {
    await listInjuryProtocols(prisma, CLUB_ID, { page: 1, limit: 50 });
    const call = vi.mocked(prisma.injuryProtocol.findMany).mock.calls[0]?.[0];
    expect(call?.orderBy).toEqual([
      { structure: "asc" },
      { durationDays: "asc" },
    ]);
  });

  it("returns empty array when no protocols match filters", async () => {
    vi.mocked(prisma.injuryProtocol.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.injuryProtocol.count).mockResolvedValue(0);
    const result = await listInjuryProtocols(prisma, CLUB_ID, {
      page: 1,
      limit: 50,
      structure: "NonExistentStructure",
    });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("applies correct skip for pagination", async () => {
    await listInjuryProtocols(prisma, CLUB_ID, { page: 3, limit: 10 });
    const call = vi.mocked(prisma.injuryProtocol.findMany).mock.calls[0]?.[0];
    expect(call?.skip).toBe(20);
    expect(call?.take).toBe(10);
  });

  it("calls $transaction (withTenantSchema)", async () => {
    await listInjuryProtocols(prisma, CLUB_ID, { page: 1, limit: 50 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("selects only summary fields (no steps in query)", async () => {
    await listInjuryProtocols(prisma, CLUB_ID, { page: 1, limit: 50 });
    const call = vi.mocked(prisma.injuryProtocol.findMany).mock.calls[0]?.[0];
    expect(call?.select).toBeDefined();
    expect(call?.select).not.toHaveProperty("steps");
  });
});

describe("getInjuryProtocolById()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue(
      PROTOCOL_ROW as never,
    );
  });

  it("returns full protocol including steps", async () => {
    const result = await getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID);
    expect(result.id).toBe(PROTOCOL_ID);
    expect(result.steps).toBeInstanceOf(Array);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("returns correct protocol fields", async () => {
    const result = await getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID);
    expect(result.name).toBe(PROTOCOL_ROW.name);
    expect(result.structure).toBe("Hamstring");
    expect(result.grade).toBe("GRADE_1");
    expect(result.durationDays).toBe(7);
    expect(result.source).toBe("FIFA Medical 2023");
    expect(result.isActive).toBe(true);
  });

  it("throws InjuryProtocolNotFoundError for unknown id", async () => {
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue(null);
    await expect(
      getInjuryProtocolById(prisma, CLUB_ID, "nonexistent"),
    ).rejects.toThrowError(InjuryProtocolNotFoundError);
  });

  it("throws InjuryProtocolNotFoundError for inactive protocol", async () => {
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue({
      ...PROTOCOL_ROW,
      isActive: false,
    } as never);
    await expect(
      getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID),
    ).rejects.toThrowError(InjuryProtocolNotFoundError);
  });

  it("formats createdAt as ISO string", async () => {
    const result = await getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID);
    expect(result.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });

  it("steps field is a parsed array (not raw JSON string)", async () => {
    const result = await getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID);
    expect(Array.isArray(result.steps)).toBe(true);
    const firstStep = result.steps[0];
    expect(firstStep).toHaveProperty("day");
    expect(firstStep).toHaveProperty("activity");
  });

  it("returns empty string for source when null", async () => {
    vi.mocked(prisma.injuryProtocol.findUnique).mockResolvedValue({
      ...PROTOCOL_ROW,
      source: null,
    } as never);
    const result = await getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID);
    expect(result.source).toBe("");
  });

  it("calls $transaction (withTenantSchema)", async () => {
    await getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("queries by the provided protocolId", async () => {
    await getInjuryProtocolById(prisma, CLUB_ID, PROTOCOL_ID);
    expect(prisma.injuryProtocol.findUnique).toHaveBeenCalledWith({
      where: { id: PROTOCOL_ID },
    });
  });
});
