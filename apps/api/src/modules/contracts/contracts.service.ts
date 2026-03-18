import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import type {
  CreateContractInput,
  UpdateContractInput,
  ListContractsQuery,
  ContractResponse,
} from "./contracts.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";
import { withTenantSchema } from "../../lib/prisma.js";
import { AthleteNotFoundError } from "../athletes/athletes.service.js";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../lib/errors.js";

export { AthleteNotFoundError };

export class ContractNotFoundError extends NotFoundError {
  constructor() {
    super("Contrato não encontrado");
  }
}

export class ActiveContractAlreadyExistsError extends ConflictError {
  constructor() {
    super(
      "Atleta já possui um contrato ATIVO. Encerre o contrato atual antes de criar um novo.",
    );
  }
}

export class ContractAlreadyTerminatedError extends ValidationError {
  constructor() {
    super("Contrato já está TERMINATED e não pode ser alterado.");
  }
}

type ContractRow = {
  id: string;
  athleteId: string;
  type: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
  bidRegistered: boolean;
  federationCode: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toContractResponse(c: ContractRow): ContractResponse {
  return {
    id: c.id,
    athleteId: c.athleteId,
    type: c.type,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    bidRegistered: c.bidRegistered,
    federationCode: c.federationCode,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/**
 * Creates a new contract in the tenant schema.
 *
 * Business rules enforced:
 *   1. Athlete must exist in this tenant schema.
 *   2. At-most-one ACTIVE contract per athlete.
 *
 * Writes a CONTRACT_CREATED audit log entry on success.
 */
export async function createContract(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateContractInput,
): Promise<ContractResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: input.athleteId },
    });
    if (!athlete) throw new AthleteNotFoundError();

    const existing = await tx.contract.findFirst({
      where: { athleteId: input.athleteId, status: "ACTIVE" },
    });
    if (existing) throw new ActiveContractAlreadyExistsError();

    const contract = await tx.contract.create({
      data: {
        athleteId: input.athleteId,
        type: input.type,
        status: "ACTIVE",
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        bidRegistered: input.bidRegistered ?? false,
        federationCode: input.federationCode ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "CONTRACT_CREATED",
        entityId: contract.id,
        entityType: "Contract",
        metadata: { athleteId: contract.athleteId, type: contract.type },
      },
    });

    return toContractResponse(contract);
  });
}

/**
 * Returns a single contract by id.
 * Throws ContractNotFoundError if no record exists in the tenant schema.
 */
export async function getContractById(
  prisma: PrismaClient,
  clubId: string,
  contractId: string,
): Promise<ContractResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new ContractNotFoundError();
    return toContractResponse(contract);
  });
}

/**
 * Partially updates a contract (status, endDate, bidRegistered, federationCode, notes).
 * athleteId and type are intentionally immutable and absent from UpdateContractInput.
 *
 * Business rules enforced:
 *   1. TERMINATED contracts are immutable — throws ContractAlreadyTerminatedError.
 *   2. Transitioning TO ACTIVE enforces the single-active-per-athlete rule
 *      (excluding the contract being updated from the check).
 *
 * Audit action:
 *   - CONTRACT_TERMINATED when input.status === "TERMINATED"
 *   - CONTRACT_UPDATED for all other updates
 */
export async function updateContract(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  contractId: string,
  input: UpdateContractInput,
): Promise<ContractResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.contract.findUnique({
      where: { id: contractId },
    });
    if (!existing) throw new ContractNotFoundError();

    if (existing.status === "TERMINATED")
      throw new ContractAlreadyTerminatedError();

    if (input.status === "ACTIVE" && existing.status !== "ACTIVE") {
      const activeOther = await tx.contract.findFirst({
        where: {
          athleteId: existing.athleteId,
          status: "ACTIVE",
          NOT: { id: contractId },
        },
      });
      if (activeOther) throw new ActiveContractAlreadyExistsError();
    }

    const updateData: Prisma.ContractUpdateInput = { updatedAt: new Date() };
    if (input.status !== undefined) updateData.status = input.status;
    if (input.endDate !== undefined)
      updateData.endDate = input.endDate ? new Date(input.endDate) : null;
    if (input.bidRegistered !== undefined)
      updateData.bidRegistered = input.bidRegistered;
    if ("federationCode" in input)
      updateData.federationCode = input.federationCode ?? null;
    if ("notes" in input) updateData.notes = input.notes ?? null;

    const updated = await tx.contract.update({
      where: { id: contractId },
      data: updateData,
    });

    const auditAction =
      input.status === "TERMINATED"
        ? "CONTRACT_TERMINATED"
        : "CONTRACT_UPDATED";

    await tx.auditLog.create({
      data: {
        actorId,
        action: auditAction,
        entityId: updated.id,
        entityType: "Contract",
        metadata: { changes: input },
      },
    });

    return toContractResponse(updated);
  });
}

/**
 * Returns a paginated, filterable list of contracts.
 * Supports optional `athleteId` and `status` filters.
 * Results are ordered by createdAt descending (most recent first).
 */
export async function listContracts(
  prisma: PrismaClient,
  clubId: string,
  params: ListContractsQuery,
): Promise<PaginatedResponse<ContractResponse>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where: Prisma.ContractWhereInput = {};
    if (params.athleteId) where.athleteId = params.athleteId;
    if (params.status) where.status = params.status;

    const [total, rows] = await Promise.all([
      tx.contract.count({ where }),
      tx.contract.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
    ]);

    return {
      data: rows.map(toContractResponse),
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}
