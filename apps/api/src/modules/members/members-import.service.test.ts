import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseCsv,
  validateRow,
  importMembersFromCsv,
} from "./members-import.service.js";

const mockFindMemberByCpf = vi.fn();
const mockEncryptField = vi.fn();

vi.mock("../../lib/crypto.js", () => ({
  findMemberByCpf: (...args: unknown[]) => mockFindMemberByCpf(...args),
  encryptField: (...args: unknown[]) => mockEncryptField(...args),
  getEncryptionKey: () => "ci-test-encryption-key-32chars-xxx",
  decryptField: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMemberByCpf.mockResolvedValue(null);
  mockEncryptField.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

function buildMockTx(overrides: Record<string, unknown> = {}) {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    member: {
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: { name: string } }) =>
          Promise.resolve({ id: `id-${data.name}`, ...data }),
        ),
      update: vi
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => Promise.resolve({ id: where.id, ...data }),
        ),
    },
    plan: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    memberPlan: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

function buildMockPrisma(txOverrides: Record<string, unknown> = {}) {
  const tx = buildMockTx(txOverrides);
  const prisma = {
    $transaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  };
  return prisma as unknown as {
    $transaction: ReturnType<typeof vi.fn>;
    _tx: typeof tx;
  } & import("../../../generated/prisma/index.js").PrismaClient;
}

const VALID_CSV = `nome,cpf,telefone,email
João Silva,12345678901,11999990000,joao@email.com
Maria Souza,98765432100,21988881111,maria@email.com`;

const VALID_CSV_SINGLE = `nome,cpf,telefone
João Silva,12345678901,11999990000`;

describe("parseCsv", () => {
  it("returns rows for a valid CSV", () => {
    const csv = `nome,cpf,telefone,email\nJoão Silva,12345678901,11999990000,joao@email.com`;
    const result = parseCsv(csv);
    expect("rows" in result).toBe(true);
    if ("rows" in result) {
      expect(result.rows).toHaveLength(1);
    }
  });

  it("returns error when required columns are missing", () => {
    const csv = `nome,email\nJoão,joao@email.com`;
    const result = parseCsv(csv);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("cpf");
      expect(result.error).toContain("telefone");
    }
  });

  it("returns error when row count exceeds 5000", () => {
    const header = "nome,cpf,telefone\n";
    const rows = Array.from(
      { length: 5001 },
      (_, i) => `Name${i},${String(i).padStart(11, "0")},11999990000`,
    ).join("\n");
    const result = parseCsv(header + rows);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("5000");
    }
  });

  it("accepts exactly 5000 rows", () => {
    const header = "nome,cpf,telefone\n";
    const rows = Array.from(
      { length: 5000 },
      (_, i) => `Name${i},${String(i).padStart(11, "0")},11999990000`,
    ).join("\n");
    const result = parseCsv(header + rows);
    expect("rows" in result).toBe(true);
  });

  it("strips leading/trailing whitespace from headers", () => {
    const csv = ` nome , cpf , telefone \nJoão,12345678901,11999990000`;
    const result = parseCsv(csv);
    expect("rows" in result).toBe(true);
  });
});

describe("validateRow", () => {
  const validRaw = {
    nome: "João Silva",
    cpf: "12345678901",
    telefone: "11999990000",
  };

  it("returns a valid row for correct data", () => {
    const result = validateRow(validRaw, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.name).toBe("João Silva");
      expect(result.row.cpf).toBe("12345678901");
      expect(result.row.phone).toBe("11999990000");
    }
  });

  it("strips CPF mask (dots and dash)", () => {
    const result = validateRow({ ...validRaw, cpf: "123.456.789-01" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.cpf).toBe("12345678901");
    }
  });

  it("strips phone mask", () => {
    const result = validateRow({ ...validRaw, telefone: "(11) 99999-0000" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.phone).toBe("11999990000");
    }
  });

  it("accepts 10-digit phone (landline)", () => {
    const result = validateRow({ ...validRaw, telefone: "1133334444" }, 0);
    expect("row" in result).toBe(true);
  });

  it("returns error for name too short", () => {
    const result = validateRow({ ...validRaw, nome: "J" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors[0]?.field).toBe("nome");
    }
  });

  it("returns error for CPF with wrong length", () => {
    const result = validateRow({ ...validRaw, cpf: "1234567890" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors[0]?.field).toBe("cpf");
    }
  });

  it("returns error for phone with wrong length", () => {
    const result = validateRow({ ...validRaw, telefone: "123456789" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors[0]?.field).toBe("telefone");
    }
  });

  it("returns error for invalid email format", () => {
    const result = validateRow({ ...validRaw, email: "not-an-email" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors[0]?.field).toBe("email");
    }
  });

  it("accepts valid email", () => {
    const result = validateRow({ ...validRaw, email: "joao@example.com" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.email).toBe("joao@example.com");
    }
  });

  it("treats empty email as undefined (optional)", () => {
    const result = validateRow({ ...validRaw, email: "" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.email).toBeUndefined();
    }
  });

  it("parses ISO date in data_entrada", () => {
    const result = validateRow({ ...validRaw, data_entrada: "2025-01-15" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.joinedAt).toBeInstanceOf(Date);
    }
  });

  it("parses dd/mm/yyyy date in data_entrada", () => {
    const result = validateRow({ ...validRaw, data_entrada: "15/01/2025" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.joinedAt).toBeInstanceOf(Date);
    }
  });

  it("treats empty data_entrada as undefined", () => {
    const result = validateRow({ ...validRaw, data_entrada: "" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.joinedAt).toBeUndefined();
    }
  });

  it("sets row number as rowIndex + 2 (1-based + header)", () => {
    const result = validateRow({ ...validRaw, cpf: "bad" }, 3);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors[0]?.row).toBe(5);
    }
  });

  it("accumulates multiple errors in one row", () => {
    const result = validateRow({ nome: "J", cpf: "bad", telefone: "bad" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("validateRow — CSV injection guard (L-07)", () => {
  const validBase = {
    nome: "João Silva",
    cpf: "12345678901",
    telefone: "11999990000",
  };

  it.each([
    ['=HYPERLINK("http://evil.com","Click")', "equals sign"],
    ["+cmd|calc", "plus sign"],
    ["-1+1", "minus sign"],
    ["@SUM(A1:A10)", "at sign"],
    ["\tTabShift", "tab character"],
    ["\rCarriageReturn", "carriage return"],
    ["|DDE|cmd|...", "pipe"],
  ])('rejects nome starting with injection trigger "%s" (%s)', (nome) => {
    const result = validateRow({ ...validBase, nome }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      const nameErrors = result.errors.filter((e) => e.field === "nome");
      expect(nameErrors).toHaveLength(1);
      expect(nameErrors[0]?.message).toMatch(
        /injeção de fórmula|caractere inválido/i,
      );
    }
  });

  it("accepts a name that contains = in a non-leading position", () => {
    const result = validateRow({ ...validBase, nome: "Maria = Silva" }, 0);
    expect("row" in result).toBe(true);
  });

  it("accepts a name that contains + in a non-leading position", () => {
    const result = validateRow({ ...validBase, nome: "José+Maria" }, 0);
    expect("row" in result).toBe(true);
  });

  it("accepts a name that contains @ in a non-leading position", () => {
    const result = validateRow({ ...validBase, nome: "User@Domain" }, 0);
    expect("row" in result).toBe(true);
  });

  it("reports injection error (not length error) when name is valid length but starts with =", () => {
    const result = validateRow({ ...validBase, nome: "=AB" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      const nameErrors = result.errors.filter((e) => e.field === "nome");
      expect(nameErrors).toHaveLength(1);
      expect(nameErrors[0]?.message).toMatch(/injeção de fórmula/i);
    }
  });

  it("reports length error (not injection error) when name is too short and starts with =", () => {
    const result = validateRow({ ...validBase, nome: "=" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      const nameErrors = result.errors.filter((e) => e.field === "nome");
      expect(nameErrors).toHaveLength(1);
      expect(nameErrors[0]?.message).toMatch(/2 e 120 caracteres/i);
    }
  });

  it("rejects email starting with injection trigger character", () => {
    const result = validateRow(
      { ...validBase, email: "=HYPERLINK@evil.com" },
      0,
    );
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      const emailErrors = result.errors.filter((e) => e.field === "email");
      expect(emailErrors).toHaveLength(1);
      expect(emailErrors[0]?.message).toMatch(/injeção de fórmula/i);
    }
  });

  it("rejects email starting with + trigger char", () => {
    const result = validateRow({ ...validBase, email: "+1FORMULA" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      const emailErrors = result.errors.filter((e) => e.field === "email");
      expect(emailErrors).toHaveLength(1);
    }
  });

  it("accepts email that starts with a letter even if @ appears later", () => {
    const result = validateRow({ ...validBase, email: "joao@example.com" }, 0);
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.email).toBe("joao@example.com");
    }
  });

  it("does not report both injection error and format error for the same email", () => {
    const result = validateRow({ ...validBase, email: "=notanemail" }, 0);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      const emailErrors = result.errors.filter((e) => e.field === "email");
      expect(emailErrors).toHaveLength(1);
      expect(emailErrors[0]?.message).toMatch(/injeção de fórmula/i);
    }
  });

  it("injection error for nome does not suppress other field errors on the same row", () => {
    const result = validateRow(
      { nome: "=BadFormula", cpf: "BADCPF", telefone: "bad" },
      0,
    );
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain("nome");
      expect(fields).toContain("cpf");
      expect(fields).toContain("telefone");
    }
  });
});

describe("importMembersFromCsv", () => {
  const clubId = "club-001";
  const actorId = "actor-001";

  it("returns error for invalid CSV structure", async () => {
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(
      prisma,
      clubId,
      actorId,
      "coluna1,coluna2\nval1,val2",
    );
    expect("error" in result).toBe(true);
  });

  it("creates members when none exist (created=N, updated=0)", async () => {
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(
      prisma,
      clubId,
      actorId,
      VALID_CSV,
    );
    expect("imported" in result).toBe(true);
    if ("imported" in result) {
      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("updates all members on reimport (created=0, updated=N)", async () => {
    mockFindMemberByCpf.mockImplementation(
      async (_tx: unknown, cpf: string) => ({ id: `existing-${cpf}` }),
    );
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(
      prisma,
      clubId,
      actorId,
      VALID_CSV,
    );
    if ("imported" in result) {
      expect(result.created).toBe(0);
      expect(result.updated).toBe(2);
    }
  });

  it("correctly counts mix of new and existing CPFs", async () => {
    mockFindMemberByCpf.mockImplementation(
      async (_tx: unknown, cpf: string) => {
        if (cpf === "12345678901") return { id: "existing-id" };
        return null;
      },
    );
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(
      prisma,
      clubId,
      actorId,
      VALID_CSV,
    );
    if ("imported" in result) {
      expect(result.created).toBe(1);
      expect(result.updated).toBe(1);
    }
  });

  it("records validation error for invalid CPF but processes other rows", async () => {
    const csv = `nome,cpf,telefone
João Silva,INVALIDO,11999990000
Maria Souza,98765432100,21988881111`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    if ("imported" in result) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe("cpf");
      expect(result.created).toBe(1);
    }
  });

  it("records validation error for invalid email but processes other rows", async () => {
    const csv = `nome,cpf,telefone,email
João Silva,12345678901,11999990000,not-valid
Maria Souza,98765432100,21988881111,maria@ok.com`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    if ("imported" in result) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe("email");
      expect(result.created).toBe(1);
    }
  });

  it("creates member without plan when planId does not exist in tenant", async () => {
    const csv = `nome,cpf,telefone,plano_id
João Silva,12345678901,11999990000,nonexistent-plan-id`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    if ("imported" in result) {
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("creates member without plan when plan is inactive", async () => {
    const csv = `nome,cpf,telefone,plano_id
João Silva,12345678901,11999990000,plan-001`;
    const tx = buildMockTx();
    (tx.plan.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "plan-001",
      isActive: false,
    });
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("../../../generated/prisma/index.js").PrismaClient;
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    if ("imported" in result) {
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(
        tx.memberPlan.upsert as ReturnType<typeof vi.fn>,
      ).not.toHaveBeenCalled();
    }
  });

  it("does NOT include joinedAt in update payload", async () => {
    mockFindMemberByCpf.mockResolvedValue({ id: "existing-member" });
    const tx = buildMockTx();
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("../../../generated/prisma/index.js").PrismaClient;

    await importMembersFromCsv(prisma, clubId, actorId, VALID_CSV_SINGLE);

    const updateCall = (tx.member.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(updateCall).toBeDefined();
    expect(updateCall.data).not.toHaveProperty("joinedAt");
  });

  it("does NOT include status in update payload", async () => {
    mockFindMemberByCpf.mockResolvedValue({ id: "existing-member" });
    const tx = buildMockTx();
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("../../../generated/prisma/index.js").PrismaClient;

    await importMembersFromCsv(prisma, clubId, actorId, VALID_CSV_SINGLE);

    const updateCall = (tx.member.update as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(updateCall.data).not.toHaveProperty("status");
  });

  it("returns imported=total, created and updated counts, errors array for mixed CSV", async () => {
    const csv = `nome,cpf,telefone,email
João Silva,12345678901,11999990000,joao@ok.com
Maria BAD,INVALIDO,21988881111,
Carlos Lima,11122233344,31977772222,`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    if ("imported" in result) {
      expect(result.imported).toBe(3);
      expect(result.errors).toHaveLength(1);
      expect(result.created).toBe(2);
    }
  });

  it("returns created=0, updated=0 when all rows are invalid", async () => {
    const csv = `nome,cpf,telefone
J,INVALIDO,bad`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    if ("imported" in result) {
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("writes auditLog after all rows processed", async () => {
    const tx = buildMockTx();
    const prisma = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("../../../generated/prisma/index.js").PrismaClient;

    await importMembersFromCsv(prisma, clubId, actorId, VALID_CSV_SINGLE);

    expect(
      tx.auditLog.create as ReturnType<typeof vi.fn>,
    ).toHaveBeenCalledOnce();
    const auditCall = (tx.auditLog.create as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(auditCall.data.actorId).toBe(actorId);
    expect(auditCall.data.metadata.source).toBe("csv_import");
    expect(auditCall.data.metadata).toHaveProperty("created");
    expect(auditCall.data.metadata).toHaveProperty("updated");
    expect(auditCall.data.metadata).toHaveProperty("skipped");
  });

  it("skips row with formula injection in nome and processes remaining valid rows", async () => {
    const csv = `nome,cpf,telefone
=HYPERLINK("http://evil.com","Click"),12345678901,11999990000
Maria Souza,98765432100,21988881111`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe("nome");
      expect(result.errors[0]?.message).toMatch(/injeção de fórmula/i);
    }
  });

  it("skips row with formula injection in email and processes remaining valid rows", async () => {
    const csv = `nome,cpf,telefone,email
João Silva,12345678901,11999990000,=FORMULA@evil.com
Maria Souza,98765432100,21988881111,maria@ok.com`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe("email");
    }
  });

  it("reports injection in imported count but not in created count", async () => {
    const csv = `nome,cpf,telefone
=BAD,12345678901,11999990000
Good Name,98765432100,21988881111`;
    const prisma = buildMockPrisma();
    const result = await importMembersFromCsv(prisma, clubId, actorId, csv);
    if ("imported" in result) {
      expect(result.imported).toBe(2);
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(1);
    }
  });
});
