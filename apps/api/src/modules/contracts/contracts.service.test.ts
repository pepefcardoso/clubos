import { describe, it, expect } from "vitest";
import {
  ContractNotFoundError,
  ActiveContractAlreadyExistsError,
  ContractAlreadyTerminatedError,
  createContract,
  getContractById,
  updateContract,
  listContracts,
} from "./contracts.service.js";
import { AthleteNotFoundError } from "../athletes/athletes.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

describe("ContractNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new ContractNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new ContractNotFoundError().name).toBe("ContractNotFoundError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new ContractNotFoundError().message).toMatch(/Contrato/);
  });

  it("can be caught via instanceof in a catch block", () => {
    const fn = () => {
      throw new ContractNotFoundError();
    };
    expect(() => fn()).toThrowError(ContractNotFoundError);
  });
});

describe("ActiveContractAlreadyExistsError", () => {
  it("is an instance of Error", () => {
    expect(new ActiveContractAlreadyExistsError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new ActiveContractAlreadyExistsError().name).toBe(
      "ActiveContractAlreadyExistsError",
    );
  });

  it("carries a Portuguese user-facing message mentioning ATIVO", () => {
    expect(new ActiveContractAlreadyExistsError().message).toMatch(/ATIVO/);
  });

  it("can be caught via instanceof in a catch block", () => {
    const fn = () => {
      throw new ActiveContractAlreadyExistsError();
    };
    expect(() => fn()).toThrowError(ActiveContractAlreadyExistsError);
  });
});

describe("ContractAlreadyTerminatedError", () => {
  it("is an instance of Error", () => {
    expect(new ContractAlreadyTerminatedError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new ContractAlreadyTerminatedError().name).toBe(
      "ContractAlreadyTerminatedError",
    );
  });

  it("carries a Portuguese user-facing message mentioning TERMINATED", () => {
    expect(new ContractAlreadyTerminatedError().message).toMatch(/TERMINATED/);
  });

  it("can be caught via instanceof in a catch block", () => {
    const fn = () => {
      throw new ContractAlreadyTerminatedError();
    };
    expect(() => fn()).toThrowError(ContractAlreadyTerminatedError);
  });
});

describe("AthleteNotFoundError (re-exported from athletes.service)", () => {
  it("is importable from contracts.service", () => {
    expect(new AthleteNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new AthleteNotFoundError().name).toBe("AthleteNotFoundError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new AthleteNotFoundError().message).toMatch(/Atleta/);
  });
});

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? process.env["TEST_DATABASE_URL"];

const hasDatabase = Boolean(DATABASE_URL);

import { beforeAll, afterEach } from "vitest";
import { PrismaClient as PrismaClientImpl } from "../../../generated/prisma/index.js";
import { provisionTenantSchema } from "../../lib/tenant-schema.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { encryptField } from "../../lib/crypto.js";

function makeTestClubId(): string {
  const rand = Math.random().toString(36).slice(2).padEnd(20, "0").slice(0, 20);
  return `test${rand}`;
}

let prisma: PrismaClient;
const createdSchemas: string[] = [];

beforeAll(() => {
  if (!hasDatabase) return;
  process.env["DATABASE_URL"] = DATABASE_URL!;
  prisma = new PrismaClientImpl({ log: [] }) as unknown as PrismaClient;
});

afterEach(async () => {
  if (!hasDatabase) return;
  for (const schema of createdSchemas.splice(0)) {
    await (prisma as unknown as PrismaClientImpl).$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
    );
  }
});

/**
 * Helper: provisions a tenant schema, creates a test athlete inside it,
 * and returns the clubId and athleteId.
 */
async function setupTenantWithAthlete(): Promise<{
  clubId: string;
  athleteId: string;
}> {
  const clubId = makeTestClubId();
  createdSchemas.push(`clube_${clubId}`);
  await provisionTenantSchema(prisma, clubId);

  const encryptedCpf = await withTenantSchema(prisma, clubId, async (tx) =>
    encryptField(tx, "12345678901"),
  );

  const athlete = await withTenantSchema(prisma, clubId, async (tx) =>
    tx.athlete.create({
      data: {
        name: "Test Athlete",
        cpf: encryptedCpf,
        birthDate: new Date("1990-05-15"),
        updatedAt: new Date(),
      },
    }),
  );

  return { clubId, athleteId: athlete.id };
}

describe.skipIf(!hasDatabase)(
  "contracts service — integration tests (require DATABASE_URL)",
  () => {
    describe("createContract", () => {
      it("creates a contract and returns a ContractResponse", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        const result = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
          bidRegistered: false,
        });

        expect(result.id).toBeTruthy();
        expect(result.athleteId).toBe(athleteId);
        expect(result.type).toBe("PROFESSIONAL");
        expect(result.status).toBe("ACTIVE");
        expect(result.bidRegistered).toBe(false);
        expect(result.endDate).toBeNull();
      });

      it("persists all optional fields when provided", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        const result = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "LOAN",
          startDate: "2024-01-01",
          endDate: "2024-12-31",
          bidRegistered: true,
          federationCode: "CBF-999",
          notes: "Loan to Club B",
        });

        expect(result.endDate).toBeInstanceOf(Date);
        expect(result.bidRegistered).toBe(true);
        expect(result.federationCode).toBe("CBF-999");
        expect(result.notes).toBe("Loan to Club B");
      });

      it("writes a CONTRACT_CREATED audit log entry", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        const contract = await createContract(prisma, clubId, "actor_audit", {
          athleteId,
          type: "AMATEUR",
          startDate: "2024-01-01",
        });

        const logs = await withTenantSchema(prisma, clubId, async (tx) =>
          tx.auditLog.findMany({ where: { entityId: contract.id } }),
        );

        expect(logs).toHaveLength(1);
        expect(logs[0]?.action).toBe("CONTRACT_CREATED");
        expect(logs[0]?.actorId).toBe("actor_audit");
      });

      it("throws ActiveContractAlreadyExistsError if athlete already has an ACTIVE contract", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        await expect(
          createContract(prisma, clubId, "actor1", {
            athleteId,
            type: "AMATEUR",
            startDate: "2024-06-01",
          }),
        ).rejects.toThrow(ActiveContractAlreadyExistsError);
      });

      it("throws AthleteNotFoundError if athleteId does not exist", async () => {
        const clubId = makeTestClubId();
        createdSchemas.push(`clube_${clubId}`);
        await provisionTenantSchema(prisma, clubId);

        await expect(
          createContract(prisma, clubId, "actor1", {
            athleteId: "nonexistent-athlete-id",
            type: "PROFESSIONAL",
            startDate: "2024-01-01",
          }),
        ).rejects.toThrow(AthleteNotFoundError);
      });
    });

    describe("getContractById", () => {
      it("returns the contract when found", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        const created = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "FORMATIVE",
          startDate: "2024-01-01",
        });

        const fetched = await getContractById(prisma, clubId, created.id);
        expect(fetched.id).toBe(created.id);
        expect(fetched.type).toBe("FORMATIVE");
      });

      it("throws ContractNotFoundError for an unknown id", async () => {
        const clubId = makeTestClubId();
        createdSchemas.push(`clube_${clubId}`);
        await provisionTenantSchema(prisma, clubId);

        await expect(
          getContractById(prisma, clubId, "nonexistent-contract-id"),
        ).rejects.toThrow(ContractNotFoundError);
      });
    });

    describe("updateContract", () => {
      it("updates mutable fields and returns updated ContractResponse", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();
        const created = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        const updated = await updateContract(
          prisma,
          clubId,
          "actor_update",
          created.id,
          {
            endDate: "2025-12-31",
            bidRegistered: true,
            federationCode: "CBF-123",
            notes: "Updated notes",
          },
        );

        expect(updated.endDate).toBeInstanceOf(Date);
        expect(updated.bidRegistered).toBe(true);
        expect(updated.federationCode).toBe("CBF-123");
        expect(updated.notes).toBe("Updated notes");
      });

      it("writes CONTRACT_UPDATED to audit_log for non-termination updates", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();
        const created = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        await updateContract(prisma, clubId, "actor_update", created.id, {
          bidRegistered: true,
        });

        const logs = await withTenantSchema(prisma, clubId, async (tx) =>
          tx.auditLog.findMany({
            where: { entityId: created.id, action: "CONTRACT_UPDATED" },
          }),
        );

        expect(logs).toHaveLength(1);
        expect(logs[0]?.actorId).toBe("actor_update");
      });

      it("writes CONTRACT_TERMINATED when status transitions to TERMINATED", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();
        const created = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        const terminated = await updateContract(
          prisma,
          clubId,
          "actor_terminate",
          created.id,
          { status: "TERMINATED" },
        );

        expect(terminated.status).toBe("TERMINATED");

        const logs = await withTenantSchema(prisma, clubId, async (tx) =>
          tx.auditLog.findMany({
            where: { entityId: created.id, action: "CONTRACT_TERMINATED" },
          }),
        );
        expect(logs).toHaveLength(1);
      });

      it("throws ContractNotFoundError for an unknown id", async () => {
        const clubId = makeTestClubId();
        createdSchemas.push(`clube_${clubId}`);
        await provisionTenantSchema(prisma, clubId);

        await expect(
          updateContract(prisma, clubId, "actor1", "nonexistent-id", {
            status: "EXPIRED",
          }),
        ).rejects.toThrow(ContractNotFoundError);
      });

      it("throws ContractAlreadyTerminatedError when contract is already TERMINATED", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();
        const created = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        await updateContract(prisma, clubId, "actor1", created.id, {
          status: "TERMINATED",
        });

        await expect(
          updateContract(prisma, clubId, "actor1", created.id, {
            notes: "trying to update after termination",
          }),
        ).rejects.toThrow(ContractAlreadyTerminatedError);
      });
    });

    describe("listContracts", () => {
      it("returns paginated results with correct total", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        const result = await listContracts(prisma, clubId, {
          page: 1,
          limit: 20,
        });

        expect(result.total).toBeGreaterThanOrEqual(1);
        expect(result.data.length).toBeGreaterThanOrEqual(1);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
      });

      it("respects the athleteId filter", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        const result = await listContracts(prisma, clubId, {
          page: 1,
          limit: 20,
          athleteId,
        });

        expect(result.total).toBeGreaterThanOrEqual(1);
        expect(result.data.every((c) => c.athleteId === athleteId)).toBe(true);
      });

      it("respects the status filter", async () => {
        const { clubId, athleteId } = await setupTenantWithAthlete();

        const created = await createContract(prisma, clubId, "actor1", {
          athleteId,
          type: "PROFESSIONAL",
          startDate: "2024-01-01",
        });

        await updateContract(prisma, clubId, "actor1", created.id, {
          status: "TERMINATED",
        });

        const active = await listContracts(prisma, clubId, {
          page: 1,
          limit: 20,
          status: "ACTIVE",
        });
        expect(active.data.every((c) => c.status === "ACTIVE")).toBe(true);

        const terminated = await listContracts(prisma, clubId, {
          page: 1,
          limit: 20,
          status: "TERMINATED",
        });
        expect(terminated.data.some((c) => c.id === created.id)).toBe(true);
      });

      it("returns empty result when no contracts match the filter", async () => {
        const clubId = makeTestClubId();
        createdSchemas.push(`clube_${clubId}`);
        await provisionTenantSchema(prisma, clubId);

        const result = await listContracts(prisma, clubId, {
          page: 1,
          limit: 20,
          athleteId: "nonexistent-athlete",
        });

        expect(result.total).toBe(0);
        expect(result.data).toHaveLength(0);
      });
    });
  },
);
