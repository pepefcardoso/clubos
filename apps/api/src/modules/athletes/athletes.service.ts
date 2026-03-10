import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import type {
  CreateAthleteInput,
  UpdateAthleteInput,
  ListAthletesQuery,
  AthleteResponse,
} from "./athletes.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";
import { withTenantSchema } from "../../lib/prisma.js";
import {
  encryptField,
  decryptField,
  findAthleteByCpf,
  getEncryptionKey,
} from "../../lib/crypto.js";

export class DuplicateAthleteCpfError extends Error {
  constructor() {
    super("Atleta com este CPF já está cadastrado");
    this.name = "DuplicateAthleteCpfError";
  }
}

export class AthleteNotFoundError extends Error {
  constructor() {
    super("Atleta não encontrado");
    this.name = "AthleteNotFoundError";
  }
}

/**
 * Creates a new athlete in the tenant schema.
 * Checks for duplicate CPF, encrypts the CPF field, persists the record,
 * and writes an ATHLETE_CREATED audit log entry.
 */
export async function createAthlete(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateAthleteInput,
): Promise<AthleteResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await findAthleteByCpf(tx, input.cpf);
    if (existing) throw new DuplicateAthleteCpfError();

    const encryptedCpf = await encryptField(tx, input.cpf);

    const athlete = await tx.athlete.create({
      data: {
        name: input.name,
        cpf: encryptedCpf,
        birthDate: new Date(input.birthDate),
        position: input.position ?? null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "ATHLETE_CREATED",
        entityId: athlete.id,
        entityType: "Athlete",
        metadata: { name: athlete.name, position: athlete.position },
      },
    });

    return {
      id: athlete.id,
      name: athlete.name,
      cpf: input.cpf,
      birthDate: athlete.birthDate,
      position: athlete.position,
      status: athlete.status,
      createdAt: athlete.createdAt,
    };
  });
}

/**
 * Returns a single athlete by id, with CPF decrypted for the response.
 * Throws AthleteNotFoundError if no record exists in the tenant schema.
 */
export async function getAthleteById(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
): Promise<AthleteResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: athleteId },
    });
    if (!athlete) throw new AthleteNotFoundError();

    const cpf = await decryptField(tx, athlete.cpf);

    return {
      id: athlete.id,
      name: athlete.name,
      cpf,
      birthDate: athlete.birthDate,
      position: athlete.position,
      status: athlete.status,
      createdAt: athlete.createdAt,
    };
  });
}

/**
 * Partially updates an athlete (name, birthDate, position, status).
 * CPF is intentionally immutable and absent from UpdateAthleteInput.
 * Throws AthleteNotFoundError if no record exists.
 * Writes an ATHLETE_UPDATED audit log entry recording the requested changes.
 */
export async function updateAthlete(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  athleteId: string,
  input: UpdateAthleteInput,
): Promise<AthleteResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.athlete.findUnique({ where: { id: athleteId } });
    if (!existing) throw new AthleteNotFoundError();

    const updateData: Prisma.AthleteUpdateInput = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.birthDate !== undefined)
      updateData.birthDate = new Date(input.birthDate);
    if (input.status !== undefined) updateData.status = input.status;
    if ("position" in input) updateData.position = input.position ?? null;

    const updated = await tx.athlete.update({
      where: { id: athleteId },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "ATHLETE_UPDATED",
        entityId: updated.id,
        entityType: "Athlete",
        metadata: { changes: input },
      },
    });

    const cpf = await decryptField(tx, updated.cpf);

    return {
      id: updated.id,
      name: updated.name,
      cpf,
      birthDate: updated.birthDate,
      position: updated.position,
      status: updated.status,
      createdAt: updated.createdAt,
    };
  });
}

/**
 * Returns a paginated, filterable list of athletes.
 * CPF is decrypted inline via pgp_sym_decrypt in the raw SQL query,
 * avoiding N+1 decryption round-trips.
 * Supports optional `status` filter and `search` (name ILIKE) filter.
 */
export async function listAthletes(
  prisma: PrismaClient,
  clubId: string,
  params: ListAthletesQuery,
): Promise<PaginatedResponse<AthleteResponse>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const key = getEncryptionKey();
    const offset = (params.page - 1) * params.limit;
    const searchPattern = params.search ? `%${params.search}%` : null;

    const countRows = await tx.$queryRaw<[{ total: bigint }]>`
      SELECT COUNT(*)::bigint AS total
      FROM athletes
      WHERE
        (${params.status ?? null}::text IS NULL OR status::text = ${params.status ?? null})
        AND (${searchPattern}::text IS NULL OR name ILIKE ${searchPattern})
    `;
    const total = Number(countRows[0]?.total ?? 0);

    if (total === 0) {
      return { data: [], total: 0, page: params.page, limit: params.limit };
    }

    type RawRow = {
      id: string;
      name: string;
      cpf: string;
      birthDate: Date;
      position: string | null;
      status: string;
      createdAt: Date;
    };

    const rows = await tx.$queryRaw<RawRow[]>`
      SELECT
        id,
        name,
        pgp_sym_decrypt(cpf::bytea, ${key}::text) AS cpf,
        "birthDate",
        position,
        status::text AS status,
        "createdAt"
      FROM athletes
      WHERE
        (${params.status ?? null}::text IS NULL OR status::text = ${params.status ?? null})
        AND (${searchPattern}::text IS NULL OR name ILIKE ${searchPattern})
      ORDER BY name ASC
      LIMIT ${params.limit}::int
      OFFSET ${offset}::int
    `;

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        cpf: r.cpf,
        birthDate: r.birthDate,
        position: r.position,
        status: r.status,
        createdAt: r.createdAt,
      })),
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}
