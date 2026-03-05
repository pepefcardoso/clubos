import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMember,
  getMemberById,
  updateMember,
  listMembers,
  DuplicateCpfError,
  PlanNotFoundError,
  MemberNotFoundError,
} from "./members.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

const mockEncryptField = vi.fn();
const mockDecryptField = vi.fn();
const mockFindMemberByCpf = vi.fn();
const mockGetEncryptionKey = vi.fn();

vi.mock("../../lib/crypto.js", () => ({
  encryptField: (...args: unknown[]) => mockEncryptField(...args),
  decryptField: (...args: unknown[]) => mockDecryptField(...args),
  findMemberByCpf: (...args: unknown[]) => mockFindMemberByCpf(...args),
  getEncryptionKey: () => mockGetEncryptionKey(),
}));

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) =>
      fn(buildDefaultTx()),
  ),
  isPrismaUniqueConstraintError: (err: unknown) =>
    (err as { code?: string })?.code === "P2002",
}));

const ENCRYPTED_CPF = new Uint8Array([1, 2, 3]);
const ENCRYPTED_PHONE = new Uint8Array([4, 5, 6]);

const DECRYPTED_CPF = "12345678901";
const DECRYPTED_PHONE = "11999990000";

const STORED_MEMBER = {
  id: "member-abc",
  name: "João Silva",
  cpf: ENCRYPTED_CPF,
  phone: ENCRYPTED_PHONE,
  email: "joao@example.com",
  status: "ACTIVE",
  joinedAt: new Date("2025-01-15T00:00:00.000Z"),
  updatedAt: new Date("2025-01-15T00:00:00.000Z"),
};

const ACTIVE_PLAN = {
  id: "plan-001",
  name: "Sócio Bronze",
  priceCents: 9900,
  isActive: true,
};

const INACTIVE_PLAN = {
  id: "plan-inactive",
  name: "Plano Inativo",
  priceCents: 5000,
  isActive: false,
};

function buildDefaultTx(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([
      {
        id: STORED_MEMBER.id,
        name: STORED_MEMBER.name,
        cpf: DECRYPTED_CPF,
        phone: DECRYPTED_PHONE,
        email: STORED_MEMBER.email,
        status: "ACTIVE",
        joinedAt: STORED_MEMBER.joinedAt,
      },
    ]),

    plan: {
      findUnique: vi.fn().mockResolvedValue(ACTIVE_PLAN),
    },

    member: {
      create: vi.fn().mockResolvedValue(STORED_MEMBER),
      findUnique: vi.fn().mockResolvedValue(STORED_MEMBER),
      update: vi.fn().mockResolvedValue(STORED_MEMBER),
      count: vi.fn().mockResolvedValue(1),
    },

    memberPlan: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },

    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },

    ...overrides,
  };
}

import { withTenantSchema } from "../../lib/prisma.js";

function useTx(tx: ReturnType<typeof buildDefaultTx>) {
  vi.mocked(withTenantSchema).mockImplementation(async (_p, _id, fn) =>
    fn(tx as unknown as PrismaClient),
  );
}

const MOCK_PRISMA = {} as PrismaClient;

beforeEach(() => {
  vi.clearAllMocks();
  mockEncryptField.mockResolvedValue(ENCRYPTED_CPF);
  mockDecryptField.mockResolvedValue(DECRYPTED_CPF);
  mockFindMemberByCpf.mockResolvedValue(null);
  mockGetEncryptionKey.mockReturnValue("test-key-32-chars-xxxxxxxxxxxx");

  vi.mocked(withTenantSchema).mockImplementation(async (_p, _id, fn) =>
    fn(buildDefaultTx() as unknown as PrismaClient),
  );
});

describe("createMember()", () => {
  it("returns a MemberResponse with decrypted cpf and phone", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    const result = await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
    });

    expect(result.id).toBe(STORED_MEMBER.id);
    expect(result.name).toBe("João Silva");
    expect(result.cpf).toBe(DECRYPTED_CPF);
    expect(result.phone).toBe(DECRYPTED_CPF);
    expect(result.status).toBe("ACTIVE");
    expect(Array.isArray(result.plans)).toBe(true);
  });

  it("throws DuplicateCpfError when CPF is already registered", async () => {
    mockFindMemberByCpf.mockResolvedValue({ id: "existing-member" });

    await expect(
      createMember(MOCK_PRISMA, "club-1", "actor-1", {
        name: "João Silva",
        cpf: "12345678901",
        phone: "11999990000",
      }),
    ).rejects.toThrow(DuplicateCpfError);
  });

  it("throws PlanNotFoundError when planId does not exist", async () => {
    const tx = buildDefaultTx();
    tx.plan.findUnique.mockResolvedValue(null);
    useTx(tx);

    await expect(
      createMember(MOCK_PRISMA, "club-1", "actor-1", {
        name: "João Silva",
        cpf: "12345678901",
        phone: "11999990000",
        planId: "nonexistent-plan",
      }),
    ).rejects.toThrow(PlanNotFoundError);
  });

  it("throws PlanNotFoundError when plan is inactive", async () => {
    const tx = buildDefaultTx();
    tx.plan.findUnique.mockResolvedValue(INACTIVE_PLAN);
    useTx(tx);

    await expect(
      createMember(MOCK_PRISMA, "club-1", "actor-1", {
        name: "João Silva",
        cpf: "12345678901",
        phone: "11999990000",
        planId: INACTIVE_PLAN.id,
      }),
    ).rejects.toThrow(PlanNotFoundError);
  });

  it("creates MemberPlan when a valid planId is provided", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
      planId: ACTIVE_PLAN.id,
    });

    expect(tx.memberPlan.create).toHaveBeenCalledOnce();
    expect(tx.memberPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ planId: ACTIVE_PLAN.id }),
      }),
    );
  });

  it("does NOT create MemberPlan when planId is omitted", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
    });

    expect(tx.memberPlan.create).not.toHaveBeenCalled();
  });

  it("stores joinedAt when provided", async () => {
    const tx = buildDefaultTx();
    useTx(tx);
    const joinedAt = "2024-06-01T00:00:00.000Z";

    await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
      joinedAt,
    });

    const createCall = tx.member.create.mock.calls[0]?.[0];
    expect(createCall.data.joinedAt).toBeInstanceOf(Date);
    expect(createCall.data.joinedAt.toISOString()).toBe(joinedAt);
  });

  it("does not include joinedAt in data when not provided", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
    });

    const createCall = tx.member.create.mock.calls[0]?.[0];
    expect(createCall.data).not.toHaveProperty("joinedAt");
  });

  it("writes AuditLog entry with MEMBER_CREATED action", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
    });

    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    const auditCall = tx.auditLog.create.mock.calls[0]?.[0];
    expect(auditCall.data.action).toBe("MEMBER_CREATED");
    expect(auditCall.data.actorId).toBe("actor-1");
  });

  it("encrypts cpf and phone before persisting", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
    });

    expect(mockEncryptField).toHaveBeenCalledWith(
      expect.anything(),
      "12345678901",
    );
    expect(mockEncryptField).toHaveBeenCalledWith(
      expect.anything(),
      "11999990000",
    );
  });

  it("returns empty plans array when no planId is given", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    const result = await createMember(MOCK_PRISMA, "club-1", "actor-1", {
      name: "João Silva",
      cpf: "12345678901",
      phone: "11999990000",
    });

    expect(result.plans).toHaveLength(0);
  });
});

describe("getMemberById()", () => {
  it("returns a MemberResponse with decrypted cpf and phone", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    const result = await getMemberById(MOCK_PRISMA, "club-1", "member-abc");

    expect(result.id).toBe(STORED_MEMBER.id);
    expect(result.cpf).toBe(DECRYPTED_CPF);
    expect(result.phone).toBe(DECRYPTED_CPF);
  });

  it("throws MemberNotFoundError when member does not exist", async () => {
    const tx = buildDefaultTx();
    tx.member.findUnique.mockResolvedValue(null);
    useTx(tx);

    await expect(
      getMemberById(MOCK_PRISMA, "club-1", "ghost-id"),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("calls findUnique with the correct memberId", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await getMemberById(MOCK_PRISMA, "club-1", "member-abc");

    expect(tx.member.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "member-abc" } }),
    );
  });

  it("loads active plans for the member", async () => {
    const tx = buildDefaultTx();
    tx.memberPlan.findMany.mockResolvedValue([
      {
        memberId: "member-abc",
        endedAt: null,
        plan: { id: "plan-001", name: "Bronze", priceCents: 9900 },
      },
    ]);
    useTx(tx);

    const result = await getMemberById(MOCK_PRISMA, "club-1", "member-abc");

    expect(result.plans).toHaveLength(1);
    expect(result.plans[0]?.id).toBe("plan-001");
  });

  it("returns empty plans array when member has no active plan", async () => {
    const tx = buildDefaultTx();
    tx.memberPlan.findMany.mockResolvedValue([]);
    useTx(tx);

    const result = await getMemberById(MOCK_PRISMA, "club-1", "member-abc");

    expect(result.plans).toHaveLength(0);
  });

  it("decrypts cpf and phone fields", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await getMemberById(MOCK_PRISMA, "club-1", "member-abc");

    expect(mockDecryptField).toHaveBeenCalledTimes(2);
  });
});

describe("updateMember()", () => {
  it("returns updated MemberResponse on success", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    const result = await updateMember(
      MOCK_PRISMA,
      "club-1",
      "actor-1",
      "member-abc",
      { name: "João Atualizado" },
    );

    expect(result.id).toBe(STORED_MEMBER.id);
  });

  it("throws MemberNotFoundError when member does not exist", async () => {
    const tx = buildDefaultTx();
    tx.member.findUnique.mockResolvedValue(null);
    useTx(tx);

    await expect(
      updateMember(MOCK_PRISMA, "club-1", "actor-1", "ghost-id", {
        name: "Novo Nome",
      }),
    ).rejects.toThrow(MemberNotFoundError);
  });

  it("encrypts phone when provided in update payload", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      phone: "21988881111",
    });

    expect(mockEncryptField).toHaveBeenCalledWith(
      expect.anything(),
      "21988881111",
    );
  });

  it("does not call encryptField when phone is not in payload", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      name: "Novo Nome",
    });

    expect(mockEncryptField).not.toHaveBeenCalled();
  });

  it("ends current MemberPlan and creates new one when planId is provided", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      planId: "plan-new",
    });

    expect(tx.memberPlan.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { memberId: "member-abc", endedAt: null },
        data: { endedAt: expect.any(Date) },
      }),
    );
    expect(tx.memberPlan.create).toHaveBeenCalledOnce();
    expect(tx.memberPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { memberId: "member-abc", planId: "plan-new" },
      }),
    );
  });

  it("ends current MemberPlan but does NOT create new one when planId is null", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      planId: null,
    });

    expect(tx.memberPlan.updateMany).toHaveBeenCalledOnce();
    expect(tx.memberPlan.create).not.toHaveBeenCalled();
  });

  it("does NOT touch MemberPlan when planId is not in payload at all", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      name: "Novo Nome",
    });

    expect(tx.memberPlan.updateMany).not.toHaveBeenCalled();
    expect(tx.memberPlan.create).not.toHaveBeenCalled();
  });

  it("writes AuditLog with MEMBER_UPDATED action", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      name: "Novo Nome",
    });

    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    const auditCall = tx.auditLog.create.mock.calls[0]?.[0];
    expect(auditCall.data.action).toBe("MEMBER_UPDATED");
    expect(auditCall.data.entityId).toBe("member-abc");
    expect(auditCall.data.actorId).toBe("actor-1");
  });

  it("redacts phone in audit metadata", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      phone: "21988881111",
    });

    const auditCall = tx.auditLog.create.mock.calls[0]?.[0];
    expect(auditCall.data.metadata?.phone).toBe("[REDACTED]");
  });

  it("does not include phone plaintext in audit metadata", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await updateMember(MOCK_PRISMA, "club-1", "actor-1", "member-abc", {
      phone: "21988881111",
    });

    const auditCall = tx.auditLog.create.mock.calls[0]?.[0];
    expect(JSON.stringify(auditCall.data.metadata)).not.toContain(
      "21988881111",
    );
  });
});

describe("listMembers()", () => {
  it("returns PaginatedResponse with data, total, page and limit", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    const result = await listMembers(MOCK_PRISMA, "club-1", {
      page: 1,
      limit: 20,
    });

    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("page", 1);
    expect(result).toHaveProperty("limit", 20);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it("returns empty data array when no members exist", async () => {
    const tx = buildDefaultTx();
    tx.$queryRaw.mockResolvedValue([]);
    tx.member.count.mockResolvedValue(0);
    useTx(tx);

    const result = await listMembers(MOCK_PRISMA, "club-1", {
      page: 1,
      limit: 20,
    });

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns correct total from member.count", async () => {
    const tx = buildDefaultTx();
    tx.member.count.mockResolvedValue(42);
    useTx(tx);

    const result = await listMembers(MOCK_PRISMA, "club-1", {
      page: 1,
      limit: 20,
    });

    expect(result.total).toBe(42);
  });

  it("reflects page and limit from params in response", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    const result = await listMembers(MOCK_PRISMA, "club-1", {
      page: 3,
      limit: 5,
    });

    expect(result.page).toBe(3);
    expect(result.limit).toBe(5);
  });

  it("returns members with plans when memberPlan.findMany has results", async () => {
    const tx = buildDefaultTx();
    tx.memberPlan.findMany.mockResolvedValue([
      {
        memberId: STORED_MEMBER.id,
        endedAt: null,
        plan: { id: "plan-001", name: "Bronze", priceCents: 9900 },
      },
    ]);
    useTx(tx);

    const result = await listMembers(MOCK_PRISMA, "club-1", {
      page: 1,
      limit: 20,
    });

    const member = result.data[0];
    expect(member?.plans).toHaveLength(1);
    expect(member?.plans[0]?.name).toBe("Bronze");
  });

  it("returns member with empty plans when no active plan exists", async () => {
    const tx = buildDefaultTx();
    tx.memberPlan.findMany.mockResolvedValue([]);
    useTx(tx);

    const result = await listMembers(MOCK_PRISMA, "club-1", {
      page: 1,
      limit: 20,
    });

    expect(result.data[0]?.plans).toHaveLength(0);
  });

  it("calls getEncryptionKey for raw SQL decryption", async () => {
    const tx = buildDefaultTx();
    useTx(tx);

    await listMembers(MOCK_PRISMA, "club-1", { page: 1, limit: 20 });

    expect(mockGetEncryptionKey).toHaveBeenCalled();
  });
});

describe("Custom error classes", () => {
  it("DuplicateCpfError has correct name", () => {
    const e = new DuplicateCpfError();
    expect(e.name).toBe("DuplicateCpfError");
    expect(e).toBeInstanceOf(Error);
  });

  it("PlanNotFoundError has correct name", () => {
    const e = new PlanNotFoundError();
    expect(e.name).toBe("PlanNotFoundError");
    expect(e).toBeInstanceOf(Error);
  });

  it("MemberNotFoundError has correct name", () => {
    const e = new MemberNotFoundError();
    expect(e.name).toBe("MemberNotFoundError");
    expect(e).toBeInstanceOf(Error);
  });
});
