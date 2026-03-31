import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "../../../../generated/prisma/index.js";

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: unknown,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(_mockTx),
  ),
}));

let _mockTx: ReturnType<typeof buildMockTx>;

function buildMockTx(overrides: Record<string, unknown> = {}) {
  return {
    athlete: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "ath-001", name: "João Silva" }),
    },
    integrationToken: {
      create: vi.fn().mockResolvedValue({
        id: "tok-001",
        athleteId: "ath-001",
        label: "Apple Watch João",
        tokenHash: "stored-hash",
        isActive: true,
        lastUsedAt: null,
        createdAt: new Date("2024-06-01T10:00:00Z"),
        updatedAt: new Date("2024-06-01T10:00:00Z"),
      }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

import {
  createIntegrationToken,
  verifyIntegrationToken,
  revokeIntegrationToken,
  listIntegrationTokens,
} from "../integrations.service.js";
import { NotFoundError, UnauthorizedError } from "../../../lib/errors.js";

const PRISMA_STUB = {} as PrismaClient;
const CLUB_ID = "testclubid0000000001";
const ACTOR_ID = "user-admin-001";

beforeEach(() => {
  _mockTx = buildMockTx();
  vi.clearAllMocks();
});

describe("createIntegrationToken()", () => {
  it("returns a result with plainToken, id, athleteId, label, createdAt", async () => {
    const result = await createIntegrationToken(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      {
        athleteId: "ath-001",
        label: "Apple Watch João",
      },
    );

    expect(result).toMatchObject({
      id: "tok-001",
      athleteId: "ath-001",
      label: "Apple Watch João",
    });
    expect(result.plainToken).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it("plainToken is a 64-char hex string (32 bytes)", async () => {
    const result = await createIntegrationToken(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      {
        athleteId: "ath-001",
        label: "Watch",
      },
    );
    expect(/^[0-9a-f]{64}$/.test(result.plainToken)).toBe(true);
  });

  it("stored tokenHash is a valid bcrypt hash of the plainToken", async () => {
    let capturedHash: string | undefined;
    _mockTx.integrationToken.create.mockImplementation(
      async (args: { data: { tokenHash: string } }) => {
        capturedHash = args.data.tokenHash;
        return {
          id: "tok-001",
          athleteId: "ath-001",
          label: "Watch",
          tokenHash: capturedHash ?? "",
          isActive: true,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
    );

    const result = await createIntegrationToken(
      PRISMA_STUB,
      CLUB_ID,
      ACTOR_ID,
      {
        athleteId: "ath-001",
        label: "Watch",
      },
    );

    expect(capturedHash).toBeDefined();
    const matches = await bcrypt.compare(result.plainToken, capturedHash!);
    expect(matches).toBe(true);
  });

  it("two calls produce different plainTokens (entropy check)", async () => {
    const r1 = await createIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      athleteId: "ath-001",
      label: "W1",
    });
    const r2 = await createIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      athleteId: "ath-001",
      label: "W2",
    });
    expect(r1.plainToken).not.toBe(r2.plainToken);
  });

  it("throws NotFoundError when athlete does not exist", async () => {
    _mockTx.athlete.findUnique.mockResolvedValue(null);

    await expect(
      createIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
        athleteId: "ghost-athlete",
        label: "Watch",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes an AuditLog entry with entityType IntegrationToken", async () => {
    await createIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      athleteId: "ath-001",
      label: "Watch",
    });

    expect(_mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: ACTOR_ID,
          entityType: "IntegrationToken",
          action: "ATHLETE_UPDATED",
        }),
      }),
    );
  });

  it("calls integrationToken.create exactly once", async () => {
    await createIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      athleteId: "ath-001",
      label: "Watch",
    });
    expect(_mockTx.integrationToken.create).toHaveBeenCalledOnce();
  });

  it("stores the label in the created token", async () => {
    await createIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, {
      athleteId: "ath-001",
      label: "My Custom Label",
    });

    expect(_mockTx.integrationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: "My Custom Label" }),
      }),
    );
  });
});

describe("verifyIntegrationToken()", () => {
  it("returns athleteId and tokenId when the token matches", async () => {
    const plainToken = "a".repeat(64);
    const hash = await bcrypt.hash(plainToken, 10);

    _mockTx.integrationToken.findMany.mockResolvedValue([
      { id: "tok-001", athleteId: "ath-001", tokenHash: hash },
    ]);
    _mockTx.integrationToken.update.mockResolvedValue({});

    const result = await verifyIntegrationToken(
      PRISMA_STUB,
      CLUB_ID,
      plainToken,
    );
    expect(result).toEqual({ athleteId: "ath-001", tokenId: "tok-001" });
  });

  it("throws UnauthorizedError when no token matches", async () => {
    const hash = await bcrypt.hash("correct-token-64chars".padEnd(64, "0"), 10);
    _mockTx.integrationToken.findMany.mockResolvedValue([
      { id: "tok-001", athleteId: "ath-001", tokenHash: hash },
    ]);

    await expect(
      verifyIntegrationToken(PRISMA_STUB, CLUB_ID, "f".repeat(64)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when no active tokens exist", async () => {
    _mockTx.integrationToken.findMany.mockResolvedValue([]);

    await expect(
      verifyIntegrationToken(PRISMA_STUB, CLUB_ID, "a".repeat(64)),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("queries only isActive tokens", async () => {
    _mockTx.integrationToken.findMany.mockResolvedValue([]);

    await expect(
      verifyIntegrationToken(PRISMA_STUB, CLUB_ID, "a".repeat(64)),
    ).rejects.toThrow();

    expect(_mockTx.integrationToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
  });

  it("correctly identifies the matching token among multiple active tokens", async () => {
    const target = "b".repeat(64);
    const targetHash = await bcrypt.hash(target, 10);
    const otherHash = await bcrypt.hash("a".repeat(64), 10);

    _mockTx.integrationToken.findMany.mockResolvedValue([
      { id: "tok-other", athleteId: "ath-999", tokenHash: otherHash },
      { id: "tok-target", athleteId: "ath-001", tokenHash: targetHash },
    ]);
    _mockTx.integrationToken.update.mockResolvedValue({});

    const result = await verifyIntegrationToken(PRISMA_STUB, CLUB_ID, target);
    expect(result.tokenId).toBe("tok-target");
    expect(result.athleteId).toBe("ath-001");
  });
});

describe("revokeIntegrationToken()", () => {
  beforeEach(() => {
    _mockTx.integrationToken.findUnique.mockResolvedValue({
      id: "tok-001",
      athleteId: "ath-001",
      label: "Watch",
    });
  });

  it("resolves without error when token exists", async () => {
    await expect(
      revokeIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, "tok-001"),
    ).resolves.toBeUndefined();
  });

  it("calls integrationToken.update with isActive: false", async () => {
    await revokeIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, "tok-001");

    expect(_mockTx.integrationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tok-001" },
        data: { isActive: false },
      }),
    );
  });

  it("throws NotFoundError when tokenId does not exist", async () => {
    _mockTx.integrationToken.findUnique.mockResolvedValue(null);

    await expect(
      revokeIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, "ghost-tok"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes an AuditLog entry with revoked: true in metadata", async () => {
    await revokeIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, "tok-001");

    expect(_mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ revoked: true }),
          entityType: "IntegrationToken",
        }),
      }),
    );
  });

  it("does NOT hard-delete the token row (update, not delete)", async () => {
    await revokeIntegrationToken(PRISMA_STUB, CLUB_ID, ACTOR_ID, "tok-001");

    expect(
      (_mockTx.integrationToken as { delete?: unknown }).delete,
    ).toBeUndefined();
    expect(_mockTx.integrationToken.update).toHaveBeenCalledOnce();
  });
});

describe("listIntegrationTokens()", () => {
  it("returns an empty array when no tokens exist", async () => {
    (_mockTx as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw =
      vi.fn().mockResolvedValue([]);

    const result = await listIntegrationTokens(PRISMA_STUB, CLUB_ID);
    expect(result).toEqual([]);
  });

  it("maps raw query rows to IntegrationTokenSummary shape", async () => {
    const rawRow = {
      id: "tok-001",
      athleteId: "ath-001",
      athlete_name: "João Silva",
      label: "Watch",
      isActive: true,
      lastUsedAt: null,
      createdAt: new Date("2024-06-01"),
    };
    (_mockTx as unknown as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw =
      vi.fn().mockResolvedValue([rawRow]);

    const result = await listIntegrationTokens(PRISMA_STUB, CLUB_ID);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "tok-001",
      athleteId: "ath-001",
      athleteName: "João Silva",
      label: "Watch",
      isActive: true,
    });
  });
});
