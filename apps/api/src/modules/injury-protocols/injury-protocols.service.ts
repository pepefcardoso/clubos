import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";
import type {
  ListInjuryProtocolsQuery,
  InjuryProtocolResponse,
  InjuryProtocolSummary,
} from "./injury-protocols.schema.js";
import type { PaginatedResponse } from "@clubos/shared-types";

export class InjuryProtocolNotFoundError extends NotFoundError {
  constructor() {
    super("Protocolo não encontrado");
    this.name = "InjuryProtocolNotFoundError";
  }
}

/**
 * Returns a paginated list of injury protocol summaries.
 *
 * Steps are intentionally excluded from the list response — callers must fetch
 * the full detail via `getInjuryProtocolById` when steps are needed. This avoids
 * transferring large JSON arrays for list/selector UIs.
 *
 * Defaults `isActive` to `true` unless explicitly overridden in params.
 * Accessible to all authenticated roles (no clinical data exposure).
 */
export async function listInjuryProtocols(
  prisma: PrismaClient,
  clubId: string,
  params: ListInjuryProtocolsQuery,
): Promise<PaginatedResponse<InjuryProtocolSummary>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = {
      ...(params.structure ? { structure: params.structure } : {}),
      ...(params.grade ? { grade: params.grade } : {}),
      isActive: params.isActive ?? true,
    };

    const [rows, total] = await Promise.all([
      tx.injuryProtocol.findMany({
        where,
        select: {
          id: true,
          name: true,
          structure: true,
          grade: true,
          durationDays: true,
          isActive: true,
        },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: [{ structure: "asc" }, { durationDays: "asc" }],
      }),
      tx.injuryProtocol.count({ where }),
    ]);

    return {
      data: rows,
      total,
      page: params.page,
      limit: params.limit,
    };
  });
}

/**
 * Returns a single protocol with full detail, including the steps array.
 *
 * Returns 404 for both unknown IDs and inactive protocols — we do not reveal
 * the existence of soft-deleted/inactive records (consistent with the
 * `assertXBelongsToClub` 404-over-403 pattern used throughout the codebase).
 *
 * Accessible to all authenticated roles (no clinical data exposure).
 */
export async function getInjuryProtocolById(
  prisma: PrismaClient,
  clubId: string,
  protocolId: string,
): Promise<InjuryProtocolResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const protocol = await tx.injuryProtocol.findUnique({
      where: { id: protocolId },
    });

    if (!protocol || !protocol.isActive) {
      throw new InjuryProtocolNotFoundError();
    }

    return {
      id: protocol.id,
      name: protocol.name,
      structure: protocol.structure,
      grade: protocol.grade,
      durationDays: protocol.durationDays,
      source: protocol.source ?? "",
      steps: protocol.steps as Array<{ day: string; activity: string }>,
      isActive: protocol.isActive,
      createdAt: protocol.createdAt.toISOString(),
    };
  });
}
