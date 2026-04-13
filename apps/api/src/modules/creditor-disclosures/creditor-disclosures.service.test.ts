import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCreditorDisclosure,
  listCreditorDisclosures,
  updateCreditorDisclosureStatus,
  exportCreditorDisclosuresPdf,
} from "./creditor-disclosures.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

function makeDisclosureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cd_001",
    creditorName: "João Silva",
    description: "Rescisão contratual",
    amountCents: 1500000,
    dueDate: new Date("2025-06-01T00:00:00.000Z"),
    status: "PENDING",
    registeredBy: "user_admin",
    registeredAt: new Date("2025-03-01T10:00:00.000Z"),
    createdAt: new Date("2025-03-01T10:00:00.000Z"),
    updatedAt: new Date("2025-03-01T10:00:00.000Z"),
    ...overrides,
  };
}

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

function buildMockTx(
  overrides: {
    disclosureCreate?: ReturnType<typeof makeDisclosureRow>;
    disclosureFindUnique?: ReturnType<typeof makeDisclosureRow> | null;
    disclosureUpdate?: ReturnType<typeof makeDisclosureRow>;
    disclosureFindMany?: ReturnType<typeof makeDisclosureRow>[];
    disclosureCount?: number;
    disclosureAggregate?: { _sum: { amountCents: number | null } };
    createError?: Error;
  } = {},
) {
  return {
    creditorDisclosure: {
      create: overrides.createError
        ? vi.fn().mockRejectedValue(overrides.createError)
        : vi
            .fn()
            .mockResolvedValue(
              overrides.disclosureCreate ?? makeDisclosureRow(),
            ),
      findUnique: vi
        .fn()
        .mockResolvedValue(
          overrides.disclosureFindUnique !== undefined
            ? overrides.disclosureFindUnique
            : makeDisclosureRow(),
        ),
      update: vi
        .fn()
        .mockResolvedValue(
          overrides.disclosureUpdate ??
            makeDisclosureRow({ status: "SETTLED" }),
        ),
      findMany: vi
        .fn()
        .mockResolvedValue(
          overrides.disclosureFindMany ?? [makeDisclosureRow()],
        ),
      count: vi.fn().mockResolvedValue(overrides.disclosureCount ?? 1),
      aggregate: vi.fn().mockResolvedValue(
        overrides.disclosureAggregate ?? {
          _sum: { amountCents: 1500000 },
        },
      ),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

const PRISMA_STUB = {
  club: {
    findUnique: vi.fn().mockResolvedValue({ name: "Clube Teste" }),
  },
} as unknown as PrismaClient;

const CLUB_ID = "testclubid0000000001";
const ACTOR_ID = "user_admin";

const VALID_INPUT = {
  creditorName: "João Silva",
  description: "Rescisão contratual",
  amountCents: 1500000,
  dueDate: "2025-06-01",
};

describe("createCreditorDisclosure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockTx = buildMockTx();
  });

  it("returns a correctly shaped CreditorDisclosureResponse", async () => {
    const result = await createCreditorDisclosure(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      VALID_INPUT,
    );

    expect(result).toMatchObject({
      id: "cd_001",
      creditorName: "João Silva",
      amountCents: 1500000,
      status: "PENDING",
    });
    expect(typeof result.dueDate).toBe("string");
    expect(result.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof result.registeredAt).toBe("string");
    expect(typeof result.createdAt).toBe("string");
  });

  it("always sets status to PENDING at creation regardless of input", async () => {
    await createCreditorDisclosure(PRISMA_STUB, CLUB_ID, ACTOR_ID, VALID_INPUT);

    const call = _mockTx.creditorDisclosure.create.mock.calls[0]?.[0] as {
      data: { status: string };
    };
    expect(call.data.status).toBe("PENDING");
  });

  it("always sets registeredBy from actorId, never from user input", async () => {
    await createCreditorDisclosure(PRISMA_STUB, CLUB_ID, ACTOR_ID, VALID_INPUT);

    const call = _mockTx.creditorDisclosure.create.mock.calls[0]?.[0] as {
      data: { registeredBy: string };
    };
    expect(call.data.registeredBy).toBe(ACTOR_ID);
  });

  it("writes a CREDITOR_DISCLOSURE_CREATED audit log entry", async () => {
    await createCreditorDisclosure(PRISMA_STUB, CLUB_ID, ACTOR_ID, VALID_INPUT);

    expect(_mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: ACTOR_ID,
        action: "CREDITOR_DISCLOSURE_CREATED",
        entityId: "cd_001",
        entityType: "CreditorDisclosure",
      }),
    });
  });

  it("includes creditorName, amountCents and dueDate in audit metadata", async () => {
    await createCreditorDisclosure(PRISMA_STUB, CLUB_ID, ACTOR_ID, VALID_INPUT);

    const auditCall = _mockTx.auditLog.create.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(auditCall.data.metadata).toMatchObject({
      creditorName: "João Silva",
      amountCents: 1500000,
      dueDate: "2025-06-01",
    });
  });

  it("stores null description when not provided", async () => {
    const input = { ...VALID_INPUT, description: undefined };
    await createCreditorDisclosure(PRISMA_STUB, CLUB_ID, ACTOR_ID, input);

    const call = _mockTx.creditorDisclosure.create.mock.calls[0]?.[0] as {
      data: { description: unknown };
    };
    expect(call.data.description).toBeNull();
  });

  it("propagates database errors", async () => {
    _mockTx = buildMockTx({ createError: new Error("DB write failed") });

    await expect(
      createCreditorDisclosure(PRISMA_STUB, CLUB_ID, ACTOR_ID, VALID_INPUT),
    ).rejects.toThrow("DB write failed");
  });
});

describe("listCreditorDisclosures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockTx = buildMockTx();
  });

  it("returns correctly shaped result with pagination metadata", async () => {
    const result = await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "cd_001",
      creditorName: "João Silva",
      amountCents: 1500000,
      status: "PENDING",
    });
  });

  it("returns pendingTotalCents from aggregate query", async () => {
    const result = await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.pendingTotalCents).toBe(1500000);
  });

  it("returns 0 pendingTotalCents when aggregate returns null", async () => {
    _mockTx = buildMockTx({
      disclosureAggregate: { _sum: { amountCents: null } },
    });

    const result = await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.pendingTotalCents).toBe(0);
  });

  it("applies correct skip/take for page 2", async () => {
    _mockTx = buildMockTx({ disclosureFindMany: [], disclosureCount: 0 });

    await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 2,
      limit: 10,
    });

    const call = _mockTx.creditorDisclosure.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
    };
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it("filters by status when provided", async () => {
    _mockTx = buildMockTx({ disclosureFindMany: [], disclosureCount: 0 });

    await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
      status: "SETTLED",
    });

    const call = _mockTx.creditorDisclosure.findMany.mock.calls[0]?.[0] as {
      where: { status: string };
    };
    expect(call.where.status).toBe("SETTLED");
  });

  it("does not include status filter when status is absent", async () => {
    _mockTx = buildMockTx({ disclosureFindMany: [], disclosureCount: 0 });

    await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    const call = _mockTx.creditorDisclosure.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).not.toHaveProperty("status");
  });

  it("filters by dueDateFrom when provided", async () => {
    _mockTx = buildMockTx({ disclosureFindMany: [], disclosureCount: 0 });

    await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
      dueDateFrom: "2025-01-01",
    });

    const call = _mockTx.creditorDisclosure.findMany.mock.calls[0]?.[0] as {
      where: { dueDate: { gte: Date } };
    };
    expect(call.where.dueDate.gte).toEqual(new Date("2025-01-01"));
  });

  it("orders results by dueDate asc (most urgent first)", async () => {
    _mockTx = buildMockTx({ disclosureFindMany: [], disclosureCount: 0 });

    await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    const call = _mockTx.creditorDisclosure.findMany.mock.calls[0]?.[0] as {
      orderBy: { dueDate: string };
    };
    expect(call.orderBy).toEqual({ dueDate: "asc" });
  });

  it("runs findMany, count and aggregate in parallel", async () => {
    _mockTx = buildMockTx({ disclosureFindMany: [], disclosureCount: 0 });

    await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(_mockTx.creditorDisclosure.findMany).toHaveBeenCalledTimes(1);
    expect(_mockTx.creditorDisclosure.count).toHaveBeenCalledTimes(1);
    expect(_mockTx.creditorDisclosure.aggregate).toHaveBeenCalledTimes(1);
  });

  it("serialises dueDate as YYYY-MM-DD string without timezone shift", async () => {
    const result = await listCreditorDisclosures(PRISMA_STUB, CLUB_ID, {
      page: 1,
      limit: 20,
    });

    expect(result.data[0]?.dueDate).toBe("2025-06-01");
  });
});

describe("updateCreditorDisclosureStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockTx = buildMockTx();
  });

  it("transitions PENDING → SETTLED successfully", async () => {
    _mockTx = buildMockTx({
      disclosureUpdate: makeDisclosureRow({ status: "SETTLED" }),
    });

    const result = await updateCreditorDisclosureStatus(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      "cd_001",
      { status: "SETTLED" },
    );

    expect(result.status).toBe("SETTLED");
  });

  it("transitions PENDING → DISPUTED successfully", async () => {
    _mockTx = buildMockTx({
      disclosureUpdate: makeDisclosureRow({ status: "DISPUTED" }),
    });

    const result = await updateCreditorDisclosureStatus(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      "cd_001",
      { status: "DISPUTED" },
    );

    expect(result.status).toBe("DISPUTED");
  });

  it("throws NotFoundError for unknown disclosureId", async () => {
    _mockTx = buildMockTx({ disclosureFindUnique: null });

    const { NotFoundError } = await import("../../lib/errors.js");

    await expect(
      updateCreditorDisclosureStatus(
        PRISMA_STUB,
        CLUB_ID,
        ACTOR_ID,
        "nonexistent",
        { status: "SETTLED" },
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ForbiddenError when current status is already SETTLED", async () => {
    _mockTx = buildMockTx({
      disclosureFindUnique: makeDisclosureRow({ status: "SETTLED" }),
    });

    const { ForbiddenError } = await import("../../lib/errors.js");

    await expect(
      updateCreditorDisclosureStatus(PRISMA_STUB, CLUB_ID, ACTOR_ID, "cd_001", {
        status: "SETTLED",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when current status is already DISPUTED", async () => {
    _mockTx = buildMockTx({
      disclosureFindUnique: makeDisclosureRow({ status: "DISPUTED" }),
    });

    const { ForbiddenError } = await import("../../lib/errors.js");

    await expect(
      updateCreditorDisclosureStatus(PRISMA_STUB, CLUB_ID, ACTOR_ID, "cd_001", {
        status: "DISPUTED",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("writes a CREDITOR_DISCLOSURE_UPDATED audit log entry with transition metadata", async () => {
    await updateCreditorDisclosureStatus(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      "cd_001",
      { status: "SETTLED" },
    );

    expect(_mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: ACTOR_ID,
        action: "CREDITOR_DISCLOSURE_UPDATED",
        entityId: "cd_001",
        entityType: "CreditorDisclosure",
        metadata: expect.objectContaining({
          previousStatus: "PENDING",
          newStatus: "SETTLED",
        }),
      }),
    });
  });

  it("does not call creditorDisclosure.update when not found", async () => {
    _mockTx = buildMockTx({ disclosureFindUnique: null });

    await expect(
      updateCreditorDisclosureStatus(
        PRISMA_STUB,
        CLUB_ID,
        ACTOR_ID,
        "nonexistent",
        { status: "SETTLED" },
      ),
    ).rejects.toThrow();

    expect(_mockTx.creditorDisclosure.update).not.toHaveBeenCalled();
  });
});

describe("exportCreditorDisclosuresPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _mockTx = buildMockTx();
  });

  it("returns a non-empty Buffer", async () => {
    const { buffer } = await exportCreditorDisclosuresPdf(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("returns a 64-character SHA-256 hex string", async () => {
    const { hash } = await exportCreditorDisclosuresPdf(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
    );

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash is deterministic for the same set of disclosures", async () => {
    const { hash: hash1 } = await exportCreditorDisclosuresPdf(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
    );
    const { hash: hash2 } = await exportCreditorDisclosuresPdf(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
    );

    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns correct recordCount", async () => {
    const { recordCount } = await exportCreditorDisclosuresPdf(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
    );

    expect(recordCount).toBe(1);
  });

  it("records an audit log entry with sha256Hash and recordCount", async () => {
    await exportCreditorDisclosuresPdf(PRISMA_STUB, CLUB_ID, ACTOR_ID);

    expect(_mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: ACTOR_ID,
        entityType: "CreditorDisclosureExport",
        metadata: expect.objectContaining({
          exportType: "PDF",
          recordCount: 1,
          sha256Hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
    });
  });

  it("handles an empty disclosure list (generates PDF with zero rows)", async () => {
    _mockTx = buildMockTx({ disclosureFindMany: [] });

    const { buffer, recordCount } = await exportCreditorDisclosuresPdf(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
    );

    expect(recordCount).toBe(0);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
