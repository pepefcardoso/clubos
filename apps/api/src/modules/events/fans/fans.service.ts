import type { PrismaClient } from "../../../../generated/prisma/index.js";
import type { PaginatedResponse } from "@clubos/shared-types";
import { withTenantSchema } from "../../../lib/prisma.js";
import type { FanResponse, ListFansQuery } from "./fans.schema.js";

export async function listFans(
  prisma: PrismaClient,
  clubId: string,
  params: ListFansQuery,
): Promise<PaginatedResponse<FanResponse>> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const { page, limit, search, sortBy, order } = params;
    const skip = (page - 1) * limit;

    const where = search?.trim()
      ? {
          OR: [
            {
              email: { contains: search.trim(), mode: "insensitive" as const },
            },
            { phone: { contains: search.trim() } },
            { name: { contains: search.trim(), mode: "insensitive" as const } },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      tx.fanProfile.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          totalSpentCents: true,
          eventIds: true,
          createdAt: true,
        },
      }),
      tx.fanProfile.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        totalSpentCents: r.totalSpentCents,
        eventCount: r.eventIds.length,
        createdAt: r.createdAt,
      })),
      total,
      page,
      limit,
    };
  });
}
