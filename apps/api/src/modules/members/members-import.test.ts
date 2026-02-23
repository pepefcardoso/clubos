import { describe, it, expect, vi, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import FormData from "form-data";

vi.mock("../../lib/redis.js", () => ({
  getRedisClient: vi.fn(),
  storeRefreshToken: vi.fn().mockResolvedValue(undefined),
  consumeRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
}));

import authPlugin from "../../plugins/auth.plugin.js";
import { issueAccessToken } from "../../lib/tokens.js";
import { memberRoutes } from "./members.routes.js";
import {
  parseCsv,
  validateRow,
  importMembersFromCsv,
} from "./members-import.service.js";

const TEST_ENV = {
  JWT_SECRET: "test-access-secret-at-least-32-chars!!",
  JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32chars!",
  NODE_ENV: "test",
};

const ADMIN_USER = {
  sub: "user-admin",
  clubId: "club-1",
  role: "ADMIN" as const,
};

describe("parseCsv — unit tests", () => {
  it("parses a valid CSV with header and returns rows", () => {
    const csv = `nome,cpf,telefone\nJoão Silva,12345678901,11999990000`;
    const result = parseCsv(csv);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.nome).toBe("João Silva");
    }
  });

  it("returns error when required columns are missing", () => {
    const csv = `nome,email\nJoão Silva,joao@email.com`;
    const result = parseCsv(csv);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/cpf/i);
    }
  });

  it("returns error for more than 5000 rows", () => {
    const header = "nome,cpf,telefone\n";
    const rows = Array.from(
      { length: 5001 },
      (_, i) => `Nome ${i},${String(i).padStart(11, "0")},11999990000`,
    ).join("\n");
    const result = parseCsv(header + rows);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/5000/);
    }
  });
});

describe("validateRow — unit tests", () => {
  it("accepts a valid row and strips CPF mask", () => {
    const result = validateRow(
      { nome: "João Silva", cpf: "123.456.789-01", telefone: "11999990000" },
      0,
    );
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.cpf).toBe("12345678901");
    }
  });

  it("accepts a valid row and strips phone mask", () => {
    const result = validateRow(
      { nome: "João Silva", cpf: "12345678901", telefone: "(11) 99999-0000" },
      0,
    );
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.phone).toBe("11999990000");
    }
  });

  it("returns error for invalid email format", () => {
    const result = validateRow(
      {
        nome: "João Silva",
        cpf: "12345678901",
        telefone: "11999990000",
        email: "not-an-email",
      },
      0,
    );
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors[0]?.field).toBe("email");
      expect(result.errors[0]?.row).toBe(2);
    }
  });

  it("returns error when nome is empty", () => {
    const result = validateRow(
      { nome: "", cpf: "12345678901", telefone: "11999990000" },
      2,
    );
    expect("errors" in result).toBe(true);
  });

  it("parses DD/MM/YYYY date correctly", () => {
    const result = validateRow(
      {
        nome: "Maria",
        cpf: "12345678901",
        telefone: "11999990000",
        data_entrada: "15/03/2025",
      },
      0,
    );
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.joinedAt?.getFullYear()).toBe(2025);
    }
  });

  it("handles missing optional fields gracefully", () => {
    const result = validateRow(
      { nome: "Carlos", cpf: "12345678901", telefone: "11999990000" },
      0,
    );
    expect("row" in result).toBe(true);
    if ("row" in result) {
      expect(result.row.email).toBeUndefined();
      expect(result.row.planId).toBeUndefined();
      expect(result.row.joinedAt).toBeUndefined();
    }
  });
});

function makeMockPrismaForImport(
  options: { existingCpfs?: string[]; activePlanId?: string } = {},
) {
  const { existingCpfs = [], activePlanId } = options;
  const upsertedMembers = new Map<string, { id: string; cpf: string }>();
  let memberIdCounter = 0;

  return {
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          member: {
            findMany: vi
              .fn()
              .mockImplementation(
                ({ where }: { where: { cpf: { in: string[] } } }) => {
                  const found = (where.cpf.in as string[])
                    .filter((cpf) => existingCpfs.includes(cpf))
                    .map((cpf) => ({ cpf }));
                  return Promise.resolve(found);
                },
              ),
            upsert: vi
              .fn()
              .mockImplementation(
                ({
                  where,
                  create,
                }: {
                  where: { cpf: string };
                  create: { cpf: string };
                }) => {
                  const cpf = where.cpf;
                  if (!upsertedMembers.has(cpf)) {
                    const id = `member-id-${++memberIdCounter}`;
                    upsertedMembers.set(cpf, { id, cpf });
                  }
                  return Promise.resolve(upsertedMembers.get(cpf));
                },
              ),
          },
          plan: {
            findUnique: vi
              .fn()
              .mockImplementation(({ where }: { where: { id: string } }) => {
                if (activePlanId && where.id === activePlanId) {
                  return Promise.resolve({ id: activePlanId, isActive: true });
                }
                return Promise.resolve(null);
              }),
          },
          memberPlan: {
            upsert: vi.fn().mockResolvedValue({}),
          },
          auditLog: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      }),
  };
}

describe("importMembersFromCsv — unit tests", () => {
  it("imports 3 new members correctly", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const csv = `nome,cpf,telefone
João Silva,12345678901,11999990000
Maria Souza,98765432100,21988881111
Carlos Lima,11122233344,31977772222`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("updates existing members on reimport", async () => {
    const mockPrisma = makeMockPrismaForImport({
      existingCpfs: ["12345678901", "98765432100", "11122233344"],
    });
    const csv = `nome,cpf,telefone
João Silva,12345678901,11999990000
Maria Souza,98765432100,21988881111
Carlos Lima,11122233344,31977772222`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(0);
      expect(result.updated).toBe(3);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("skips row with invalid email and reports error", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const csv = `nome,cpf,telefone,email
João Silva,12345678901,11999990000,joao@email.com
Maria Souza,98765432100,21988881111,not-an-email
Carlos Lima,11122233344,31977772222,carlos@email.com`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.field).toBe("email");
    }
  });

  it("accepts CPF with mask by stripping it", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const csv = `nome,cpf,telefone
João Silva,123.456.789-01,11999990000`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("accepts phone with mask by stripping it", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const csv = `nome,cpf,telefone
João Silva,12345678901,(11) 99999-0000`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("returns error when required columns are absent", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const csv = `nome,email
João Silva,joao@email.com`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/cpf|telefone/i);
    }
  });

  it("returns error when CSV exceeds 5000 rows", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const header = "nome,cpf,telefone\n";
    const rows = Array.from(
      { length: 5001 },
      (_, i) => `Nome ${i},${String(i).padStart(11, "0")},11999990000`,
    ).join("\n");

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      header + rows,
    );

    expect("error" in result).toBe(true);
  });

  it("returns error when CSV has no header row", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const csv = `João Silva,12345678901,11999990000`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(true);
  });

  it("creates member without plan association when planId does not exist", async () => {
    const mockPrisma = makeMockPrismaForImport();
    const csv = `nome,cpf,telefone,plano_id
João Silva,12345678901,11999990000,cjld2cyuq0099t3rmniod1fff`;

    const result = await importMembersFromCsv(
      mockPrisma as never,
      "club-1",
      "actor-1",
      csv,
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.created).toBe(1);
      expect(result.errors).toHaveLength(0);
    }
  });
});

async function buildImportTestApp(
  prismaOverride?: ReturnType<typeof makeMockPrismaForImport>,
): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value;
  }

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  } as unknown as Redis;

  fastify.decorate("redis", mockRedis);
  fastify.decorate(
    "prisma",
    (prismaOverride ?? makeMockPrismaForImport()) as never,
  );

  const fastifyMultipart = await import("@fastify/multipart");
  await fastify.register(fastifyMultipart.default, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  await fastify.register(authPlugin);

  await fastify.register(async (scope) => {
    scope.addHook("preHandler", fastify.verifyAccessToken);
    scope.addHook("preHandler", async (request) => {
      request.actorId = (request.user as { sub: string }).sub;
    });
    await scope.register(memberRoutes, { prefix: "/api/members" });
  });

  await fastify.ready();
  return fastify;
}

describe("POST /api/members/import — integration tests", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
  });

  it("returns 200 with created count for a valid CSV upload", async () => {
    app = await buildImportTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const csv = `nome,cpf,telefone
João Silva,12345678901,11999990000
Maria Souza,98765432100,21988881111`;

    const form = new FormData();
    form.append("file", Buffer.from(csv), {
      filename: "socios.csv",
      contentType: "text/csv",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/members/import",
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("created");
    expect(body).toHaveProperty("updated");
    expect(body).toHaveProperty("errors");
  });

  it("returns 400 when no file is attached", async () => {
    app = await buildImportTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const form = new FormData();

    const res = await app.inject({
      method: "POST",
      url: "/api/members/import",
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/CSV não enviado/i);
  });

  it("returns 400 when file exceeds 5 MB", async () => {
    app = await buildImportTestApp();
    const token = issueAccessToken(app, ADMIN_USER);

    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 1, "a");
    const form = new FormData();
    form.append("file", bigBuffer, {
      filename: "big.csv",
      contentType: "text/csv",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/members/import",
      headers: {
        Authorization: `Bearer ${token}`,
        ...form.getHeaders(),
      },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/5 MB/);
  });

  it("returns 401 when no token is provided", async () => {
    app = await buildImportTestApp();

    const form = new FormData();
    form.append("file", Buffer.from("nome,cpf,telefone"), {
      filename: "socios.csv",
      contentType: "text/csv",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/members/import",
      headers: { ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(401);
  });
});
