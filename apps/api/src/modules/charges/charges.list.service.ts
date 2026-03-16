import type {
  PrismaClient,
  Prisma,
  ChargeStatus,
} from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";

export interface ChargeListItem {
  id: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  dueDate: Date;
  /** Serialised as the ChargeStatus enum string value. */
  status: ChargeStatus;
  method: string;
  gatewayName: string | null;
  externalId: string | null;
  gatewayMeta: Record<string, unknown> | null;
  retryCount: number;
  createdAt: Date;
}

export interface ChargesListResult {
  data: ChargeListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ListChargesParams {
  page: number;
  limit: number;
  /** YYYY-MM format — filters by calendar month of dueDate */
  month?: string | undefined;
  /**
   * ChargeStatus enum value. Typed as the Prisma-generated enum so callers
   * coming from the validated Zod route handler are assignable without a cast.
   * `exactOptionalPropertyTypes: true` requires the explicit `| undefined`.
   */
  status?: ChargeStatus | undefined;
  memberId?: string | undefined;
}

/**
 * Returns a paginated list of charges for a club's tenant schema.
 *
 * - Optional `month` (YYYY-MM) filters by dueDate within that calendar month.
 * - Optional `status` filters by ChargeStatus enum value.
 * - Optional `memberId` scopes results to a single member.
 * - Results are ordered newest-first (dueDate DESC).
 *
 * @param prisma  - Singleton Prisma client (not a transaction).
 * @param clubId  - Tenant identifier used by withTenantSchema.
 * @param params  - Pagination + filter parameters.
 */
export async function listCharges(
  prisma: PrismaClient,
  clubId: string,
  params: ListChargesParams,
): Promise<ChargesListResult> {
  const { page, limit, month, status, memberId } = params;
  const skip = (page - 1) * limit;

  let dueDateFilter: { gte?: Date; lte?: Date } | undefined;
  if (month) {
    const parts = month.split("-");
    const year = Number(parts[0]);
    const mon = Number(parts[1]);
    if (!Number.isNaN(year) && !Number.isNaN(mon) && mon >= 1 && mon <= 12) {
      dueDateFilter = {
        gte: new Date(Date.UTC(year, mon - 1, 1)),
        lte: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
      };
    }
  }

  const where: Prisma.ChargeWhereInput = {
    ...(status !== undefined ? { status } : {}),
    ...(memberId ? { memberId } : {}),
    ...(dueDateFilter ? { dueDate: dueDateFilter } : {}),
  };

  return withTenantSchema(prisma, clubId, async (tx) => {
    const [charges, total] = await Promise.all([
      tx.charge.findMany({
        where,
        include: {
          member: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "desc" },
        skip,
        take: limit,
      }),
      tx.charge.count({ where }),
    ]);

    const data: ChargeListItem[] = charges.map((c) => ({
      id: c.id,
      memberId: c.memberId,
      memberName: c.member.name,
      amountCents: c.amountCents,
      dueDate: c.dueDate,
      status: c.status,
      method: c.method,
      gatewayName: c.gatewayName,
      externalId: c.externalId,
      gatewayMeta: c.gatewayMeta as Record<string, unknown> | null,
      retryCount: c.retryCount,
      createdAt: c.createdAt,
    }));

    return { data, total, page, limit };
  });
}
