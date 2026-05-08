import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { assertEventExists } from "../../../lib/assert-tenant-ownership.js";
import { NotFoundError } from "../../../lib/errors.js";
import {
  DEFAULT_CHECKLIST_ITEMS,
  type ChecklistItemResponse,
  type ChecklistResponse,
  type ToggleChecklistItemInput,
} from "./checklist.schema.js";

function toItemResponse(row: {
  id: string;
  eventId: string;
  category: string;
  item: string;
  completed: boolean;
  completedBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ChecklistItemResponse {
  return {
    id: row.id,
    eventId: row.eventId,
    category: row.category,
    item: row.item,
    completed: row.completed,
    completedBy: row.completedBy,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function groupByCategory(
  items: ChecklistItemResponse[],
): Record<string, ChecklistItemResponse[]> {
  const out: Record<string, ChecklistItemResponse[]> = {};
  for (const item of items) {
    (out[item.category] ??= []).push(item);
  }
  return out;
}

/**
 * Seeds DEFAULT_CHECKLIST_ITEMS for a newly created event.
 * MUST be called inside an open withTenantSchema tx — search_path already scoped.
 * [T-150]
 */
export async function seedChecklistItems(
  tx: PrismaClient,
  eventId: string,
): Promise<void> {
  const now = new Date();
  await tx.gameChecklist.createMany({
    data: DEFAULT_CHECKLIST_ITEMS.map((d) => ({
      id: randomUUID(),
      eventId,
      category: d.category,
      item: d.item,
      createdAt: now,
      updatedAt: now,
    })),
  });
}

export async function listChecklist(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
): Promise<ChecklistResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    await assertEventExists(tx, eventId);

    const rows = await tx.gameChecklist.findMany({
      where: { eventId },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    });

    const items = rows.map(toItemResponse);

    return {
      eventId,
      byCategory: groupByCategory(items),
      totalItems: items.length,
      completedItems: items.filter((i) => i.completed).length,
    };
  });
}

export async function toggleChecklistItem(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
  itemId: string,
  input: ToggleChecklistItemInput,
  actorId: string,
): Promise<ChecklistItemResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    await assertEventExists(tx, eventId);

    const existing = await tx.gameChecklist.findFirst({
      where: { id: itemId, eventId },
    });
    if (!existing) throw new NotFoundError("Item de checklist não encontrado.");

    const now = new Date();
    const updated = await tx.gameChecklist.update({
      where: { id: itemId },
      data: {
        completed: input.completed,
        completedBy: input.completed ? actorId : null,
        completedAt: input.completed ? now : null,
        updatedAt: now,
      },
    });

    return toItemResponse(updated);
  });
}
