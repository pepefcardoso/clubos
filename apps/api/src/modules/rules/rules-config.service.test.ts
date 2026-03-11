/**
 * Integration tests for rules-config.service.ts
 *
 * Strategy: mock `withTenantSchema` to pass through the callback with a fake
 * Prisma transaction object. This lets us test service logic — error handling,
 * JSONB re-validation, and orchestration — without a live database.
 *
 * The pure validation logic is tested exhaustively in rules-validator.test.ts;
 * these tests focus on:
 *   - Happy paths that confirm the returned shape
 *   - DuplicateRulesConfigError on unique constraint
 *   - RulesConfigNotFoundError / RulesConfigAthleteNotFoundError propagation
 *   - ZodError surfacing when stored JSONB is corrupt
 *   - validateAthleteAgainstRuleSet orchestration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RulesConfigResponse } from "./rules-config.schema.js";
import type { AthleteValidationResponse } from "./rules-config.schema.js";
import { DEFAULT_CBF_RULES } from "./rules.defaults.js";

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(mockTx),
  ),
  isPrismaUniqueConstraintError: (err: unknown) =>
    (err as { code?: string })?.code === "P2002",
}));

const mockTx = {
  rulesConfig: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  athlete: {
    findUnique: vi.fn(),
  },
  contract: {
    findFirst: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function getService() {
  return import("./rules-config.service.js");
}

const STUB_CONFIG = {
  id: "cfg-1",
  season: "2025",
  league: "CBF",
  rules: DEFAULT_CBF_RULES,
  isActive: true,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const STUB_ATHLETE = {
  id: "ath-1",
  name: "João Silva",
  birthDate: new Date("2000-01-01"),
  status: "ACTIVE",
  cpf: Buffer.from("encrypted"),
  position: "Atacante",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const STUB_CONTRACT = {
  id: "ctr-1",
  athleteId: "ath-1",
  type: "PROFESSIONAL",
  status: "ACTIVE",
  startDate: new Date("2025-01-01"),
  endDate: new Date("2026-01-01"),
  bidRegistered: true,
  federationCode: "CBF-001",
  notes: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

describe("createRulesConfig()", () => {
  it("returns a RulesConfigResponse with correct shape on success", async () => {
    mockTx.rulesConfig.create.mockResolvedValue(STUB_CONFIG);
    const { createRulesConfig } = await getService();

    const result = await createRulesConfig({} as never, "club-1", {
      season: "2025",
      league: "CBF",
      rules: DEFAULT_CBF_RULES,
      isActive: true,
    });

    expect(result).toMatchObject<Partial<RulesConfigResponse>>({
      id: "cfg-1",
      season: "2025",
      league: "CBF",
      isActive: true,
    });
    expect(mockTx.rulesConfig.create).toHaveBeenCalledOnce();
  });

  it("throws DuplicateRulesConfigError on unique constraint violation (P2002)", async () => {
    mockTx.rulesConfig.create.mockRejectedValue({ code: "P2002" });
    const { createRulesConfig, DuplicateRulesConfigError } = await getService();

    await expect(
      createRulesConfig({} as never, "club-1", {
        season: "2025",
        league: "CBF",
        rules: DEFAULT_CBF_RULES,
        isActive: true,
      }),
    ).rejects.toThrow(DuplicateRulesConfigError);
  });

  it("re-throws non-unique-constraint DB errors unchanged", async () => {
    const dbErr = new Error("connection timeout");
    mockTx.rulesConfig.create.mockRejectedValue(dbErr);
    const { createRulesConfig } = await getService();

    await expect(
      createRulesConfig({} as never, "club-1", {
        season: "2025",
        league: "CBF",
        rules: DEFAULT_CBF_RULES,
        isActive: true,
      }),
    ).rejects.toThrow("connection timeout");
  });
});

describe("listRulesConfigs()", () => {
  it("returns an array of RulesConfigResponse items", async () => {
    mockTx.rulesConfig.findMany.mockResolvedValue([STUB_CONFIG]);
    const { listRulesConfigs } = await getService();

    const result = await listRulesConfigs({} as never, "club-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("cfg-1");
  });

  it("passes isActive filter when onlyActive=true", async () => {
    mockTx.rulesConfig.findMany.mockResolvedValue([]);
    const { listRulesConfigs } = await getService();

    await listRulesConfigs({} as never, "club-1", true);
    const call = mockTx.rulesConfig.findMany.mock.calls[0]?.[0] as {
      where?: { isActive?: boolean };
    };
    expect(call?.where?.isActive).toBe(true);
  });

  it("does not apply isActive filter when onlyActive=false (default)", async () => {
    mockTx.rulesConfig.findMany.mockResolvedValue([]);
    const { listRulesConfigs } = await getService();

    await listRulesConfigs({} as never, "club-1");
    const call = mockTx.rulesConfig.findMany.mock.calls[0]?.[0] as {
      where?: unknown;
    };
    expect(call?.where).toBeUndefined();
  });
});

describe("getRulesConfigById()", () => {
  it("returns the config when found", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(STUB_CONFIG);
    const { getRulesConfigById } = await getService();

    const result = await getRulesConfigById({} as never, "club-1", "cfg-1");
    expect(result.id).toBe("cfg-1");
  });

  it("throws RulesConfigNotFoundError when record does not exist", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(null);
    const { getRulesConfigById, RulesConfigNotFoundError } = await getService();

    await expect(
      getRulesConfigById({} as never, "club-1", "no-such-id"),
    ).rejects.toThrow(RulesConfigNotFoundError);
  });
});

describe("updateRulesConfig()", () => {
  it("returns the updated config on success", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(STUB_CONFIG);
    const updatedStub = { ...STUB_CONFIG, isActive: false };
    mockTx.rulesConfig.update.mockResolvedValue(updatedStub);
    const { updateRulesConfig } = await getService();

    const result = await updateRulesConfig({} as never, "club-1", "cfg-1", {
      isActive: false,
    });
    expect(result.isActive).toBe(false);
  });

  it("throws RulesConfigNotFoundError when config does not exist", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(null);
    const { updateRulesConfig, RulesConfigNotFoundError } = await getService();

    await expect(
      updateRulesConfig({} as never, "club-1", "no-such-id", {
        isActive: true,
      }),
    ).rejects.toThrow(RulesConfigNotFoundError);
  });
});

describe("validateAthleteAgainstRuleSet()", () => {
  it("returns eligible=true for a fully compliant athlete", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(STUB_CONFIG);
    mockTx.athlete.findUnique.mockResolvedValue(STUB_ATHLETE);
    mockTx.contract.findFirst.mockResolvedValue(STUB_CONTRACT);
    const { validateAthleteAgainstRuleSet } = await getService();

    const result = await validateAthleteAgainstRuleSet(
      {} as never,
      "club-1",
      "cfg-1",
      "ath-1",
      new Date("2025-06-01"),
    );

    expect(result).toMatchObject<Partial<AthleteValidationResponse>>({
      athleteId: "ath-1",
      rulesConfigId: "cfg-1",
      season: "2025",
      league: "CBF",
      eligible: true,
    });
    expect(result.violations).toHaveLength(0);
    expect(result.validatedAt).toBe(new Date("2025-06-01").toISOString());
  });

  it("throws RulesConfigNotFoundError when config does not exist", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(null);
    mockTx.athlete.findUnique.mockResolvedValue(STUB_ATHLETE);
    const { validateAthleteAgainstRuleSet, RulesConfigNotFoundError } =
      await getService();

    await expect(
      validateAthleteAgainstRuleSet({} as never, "club-1", "no-cfg", "ath-1"),
    ).rejects.toThrow(RulesConfigNotFoundError);
  });

  it("throws RulesConfigAthleteNotFoundError when athlete does not exist", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(STUB_CONFIG);
    mockTx.athlete.findUnique.mockResolvedValue(null);
    const { validateAthleteAgainstRuleSet, RulesConfigAthleteNotFoundError } =
      await getService();

    await expect(
      validateAthleteAgainstRuleSet({} as never, "club-1", "cfg-1", "no-ath"),
    ).rejects.toThrow(RulesConfigAthleteNotFoundError);
  });

  it("returns BID_NOT_REGISTERED violation when bidRegistered=false", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(STUB_CONFIG);
    mockTx.athlete.findUnique.mockResolvedValue(STUB_ATHLETE);
    mockTx.contract.findFirst.mockResolvedValue({
      ...STUB_CONTRACT,
      bidRegistered: false,
    });
    const { validateAthleteAgainstRuleSet } = await getService();

    const result = await validateAthleteAgainstRuleSet(
      {} as never,
      "club-1",
      "cfg-1",
      "ath-1",
      new Date("2025-06-01"),
    );

    expect(result.eligible).toBe(false);
    expect(
      result.violations.find((v) => v.code === "BID_NOT_REGISTERED"),
    ).toBeDefined();
  });

  it("returns NO_ACTIVE_CONTRACT when no contract exists and rule requires one", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue(STUB_CONFIG);
    mockTx.athlete.findUnique.mockResolvedValue(STUB_ATHLETE);
    mockTx.contract.findFirst.mockResolvedValue(null);
    const { validateAthleteAgainstRuleSet } = await getService();

    const result = await validateAthleteAgainstRuleSet(
      {} as never,
      "club-1",
      "cfg-1",
      "ath-1",
      new Date("2025-06-01"),
    );

    expect(result.eligible).toBe(false);
    expect(
      result.violations.find((v) => v.code === "NO_ACTIVE_CONTRACT"),
    ).toBeDefined();
  });

  it("throws ZodError when stored JSONB rules are corrupt (schema drift protection)", async () => {
    mockTx.rulesConfig.findUnique.mockResolvedValue({
      ...STUB_CONFIG,
      rules: { broken: "data", missingRequiredFields: true },
    });
    mockTx.athlete.findUnique.mockResolvedValue(STUB_ATHLETE);
    const { validateAthleteAgainstRuleSet } = await getService();

    await expect(
      validateAthleteAgainstRuleSet({} as never, "club-1", "cfg-1", "ath-1"),
    ).rejects.toThrow();
  });
});
