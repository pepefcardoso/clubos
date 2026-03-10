import type { PrismaClient } from "../../../generated/prisma/index.js";
import type {
  CreateAthleteInput,
  UpdateAthleteInput,
  ListAthletesQuery,
  AthleteResponse,
} from "./athletes.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";

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
 * TODO (T-055): implement full creation logic with CPF duplicate check,
 *               encryption, and audit log entry.
 */
export async function createAthlete(
  _prisma: PrismaClient,
  _clubId: string,
  _actorId: string,
  _input: CreateAthleteInput,
): Promise<AthleteResponse> {
  throw new Error("Not implemented — see T-055");
}

/**
 * Returns a single athlete by id.
 * TODO (T-055): implement lookup with CPF decryption.
 */
export async function getAthleteById(
  _prisma: PrismaClient,
  _clubId: string,
  _athleteId: string,
): Promise<AthleteResponse> {
  throw new Error("Not implemented — see T-055");
}

/**
 * Partially updates an athlete.
 * TODO (T-055): implement update logic with optional phone re-encryption,
 *               audit log entry, and MemberNotFound guard.
 */
export async function updateAthlete(
  _prisma: PrismaClient,
  _clubId: string,
  _actorId: string,
  _athleteId: string,
  _input: UpdateAthleteInput,
): Promise<AthleteResponse> {
  throw new Error("Not implemented — see T-055");
}

/**
 * Returns a paginated, filterable list of athletes.
 * TODO (T-055): implement raw-SQL query with in-DB CPF decryption (same
 *               pattern as listMembers).
 */
export async function listAthletes(
  _prisma: PrismaClient,
  _clubId: string,
  _params: ListAthletesQuery,
): Promise<PaginatedResponse<AthleteResponse>> {
  throw new Error("Not implemented — see T-055");
}
