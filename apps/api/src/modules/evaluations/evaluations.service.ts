import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import type {
  CreateEvaluationInput,
  UpdateEvaluationInput,
  ListEvaluationsQuery,
  EvaluationResponse,
} from "./evaluations.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";

export class EvaluationNotFoundError extends NotFoundError {
  constructor() {
    super("Avaliação não encontrada");
  }
}

export class DuplicateEvaluationError extends ConflictError {
  constructor() {
    super("Já existe uma avaliação para este atleta neste microciclo");
  }
}

type ScoreFields = {
  technique: number;
  tactical: number;
  physical: number;
  mental: number;
  attitude: number;
};

/**
 * Computes the arithmetic mean of the five criterion scores,
 * rounded to 2 decimal places.
 */
function computeAverageScore(scores: ScoreFields): number {
  const sum =
    scores.technique +
    scores.tactical +
    scores.physical +
    scores.mental +
    scores.attitude;
  return parseFloat((sum / 5).toFixed(2));
}

type RawEvalRow = {
  id: string;
  athleteId: string;
  name: string;
  microcycle: string;
  date: Date;
  technique: number;
  tactical: number;
  physical: number;
  mental: number;
  attitude: number;
  notes: string | null;
  actorId: string;
  createdAt: Date;
  updatedAt: Date;
};

function toResponse(row: RawEvalRow): EvaluationResponse {
  return {
    id: row.id,
    athleteId: row.athleteId,
    athleteName: row.name,
    microcycle: row.microcycle,
    date: row.date.toISOString().slice(0, 10),
    technique: row.technique,
    tactical: row.tactical,
    physical: row.physical,
    mental: row.mental,
    attitude: row.attitude,
    averageScore: computeAverageScore(row),
    notes: row.notes,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Creates a new technical evaluation for a given athlete and microcycle.
 *
 * Enforces:
 *   - Athlete must exist in the tenant schema.
 *   - No existing evaluation for the same (athleteId, microcycle) pair
 *     (the Prisma @@unique constraint mirrors this at the DB level).
 *
 * Writes an EVALUATION_CREATED audit log entry inside the same transaction.
 */
export async function createEvaluation(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateEvaluationInput,
): Promise<EvaluationResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const athlete = await tx.athlete.findUnique({
      where: { id: input.athleteId },
      select: { id: true, name: true },
    });
    if (!athlete) throw new NotFoundError("Atleta não encontrado");

    const existing = await tx.technicalEvaluation.findUnique({
      where: {
        athleteId_microcycle: {
          athleteId: input.athleteId,
          microcycle: input.microcycle,
        },
      },
      select: { id: true },
    });
    if (existing) throw new DuplicateEvaluationError();

    const evaluation = await tx.technicalEvaluation.create({
      data: {
        athleteId: input.athleteId,
        microcycle: input.microcycle,
        date: new Date(input.date),
        technique: input.technique,
        tactical: input.tactical,
        physical: input.physical,
        mental: input.mental,
        attitude: input.attitude,
        notes: input.notes ?? null,
        actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EVALUATION_CREATED",
        entityId: evaluation.id,
        entityType: "TechnicalEvaluation",
        metadata: {
          athleteId: input.athleteId,
          microcycle: input.microcycle,
          averageScore: computeAverageScore(input),
        },
      },
    });

    return toResponse({ ...evaluation, name: athlete.name });
  });
}

/**
 * Returns a single evaluation by id, including the athlete's name.
 * Throws EvaluationNotFoundError when no record exists in the tenant schema.
 */
export async function getEvaluationById(
  prisma: PrismaClient,
  clubId: string,
  evaluationId: string,
): Promise<EvaluationResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const row = await tx.technicalEvaluation.findUnique({
      where: { id: evaluationId },
      include: { athlete: { select: { name: true } } },
    });
    if (!row) throw new EvaluationNotFoundError();

    return toResponse({ ...row, name: row.athlete.name, date: row.date });
  });
}

/**
 * Partially updates an evaluation (any subset of the five scores + notes).
 * Fields not present in `input` are left unchanged.
 * Writes an EVALUATION_UPDATED audit log entry.
 */
export async function updateEvaluation(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  evaluationId: string,
  input: UpdateEvaluationInput,
): Promise<EvaluationResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.technicalEvaluation.findUnique({
      where: { id: evaluationId },
      include: { athlete: { select: { name: true } } },
    });
    if (!existing) throw new EvaluationNotFoundError();

    const updated = await tx.technicalEvaluation.update({
      where: { id: evaluationId },
      data: {
        ...(input.technique !== undefined && { technique: input.technique }),
        ...(input.tactical !== undefined && { tactical: input.tactical }),
        ...(input.physical !== undefined && { physical: input.physical }),
        ...(input.mental !== undefined && { mental: input.mental }),
        ...(input.attitude !== undefined && { attitude: input.attitude }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: { athlete: { select: { name: true } } },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EVALUATION_UPDATED",
        entityId: evaluationId,
        entityType: "TechnicalEvaluation",
        metadata: { changes: input },
      },
    });

    return toResponse({
      ...updated,
      name: updated.athlete.name,
      date: updated.date,
    });
  });
}

/**
 * Permanently deletes an evaluation.
 * Writes an EVALUATION_DELETED audit log entry inside the same transaction.
 * Throws EvaluationNotFoundError when the record does not exist.
 */
export async function deleteEvaluation(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  evaluationId: string,
): Promise<void> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.technicalEvaluation.findUnique({
      where: { id: evaluationId },
      select: { id: true, microcycle: true, athleteId: true },
    });
    if (!existing) throw new EvaluationNotFoundError();

    await tx.technicalEvaluation.delete({ where: { id: evaluationId } });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EVALUATION_DELETED",
        entityId: evaluationId,
        entityType: "TechnicalEvaluation",
        metadata: {
          microcycle: existing.microcycle,
          athleteId: existing.athleteId,
        },
      },
    });
  });
}

/**
 * Returns a paginated, optionally-filtered list of evaluations.
 *
 * Supported filters:
 *   - `athleteId`  — restrict to a single athlete
 *   - `microcycle` — exact match on the ISO week string
 *   - `from` / `to` — date range (inclusive both ends)
 *
 * Results are ordered newest-first (date DESC).
 */
export async function listEvaluations(
  prisma: PrismaClient,
  clubId: string,
  params: ListEvaluationsQuery,
): Promise<PaginatedResponse<EvaluationResponse>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = {
      ...(params.athleteId ? { athleteId: params.athleteId } : {}),
      ...(params.microcycle ? { microcycle: params.microcycle } : {}),
      ...(params.from || params.to
        ? {
            date: {
              ...(params.from ? { gte: new Date(params.from) } : {}),
              ...(params.to
                ? { lte: new Date(`${params.to}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      tx.technicalEvaluation.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { date: "desc" },
        include: { athlete: { select: { name: true } } },
      }),
      tx.technicalEvaluation.count({ where }),
    ]);

    return {
      data: rows.map((row) =>
        toResponse({ ...row, name: row.athlete.name, date: row.date }),
      ),
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}
