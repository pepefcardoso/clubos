import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { NotFoundError, ConflictError } from "../../../lib/errors.js";
import type {
  CreatePosProductInput,
  UpdatePosProductInput,
  ListPosProductsQuery,
  PosProductResponse,
  PosProductsListResponse,
} from "./products.schema.js";

export class PosProductNotFoundError extends NotFoundError {
  constructor() {
    super("Produto não encontrado.");
  }
}

export class DuplicatePosProductNameError extends ConflictError {
  constructor() {
    super("Já existe um produto ativo com este nome.");
  }
}

function toResponse(row: {
  id: string;
  name: string;
  priceCents: number;
  category: string | null;
  stock: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PosProductResponse {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents,
    category: row.category,
    stock: row.stock,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listPosProducts(
  prisma: PrismaClient,
  clubId: string,
  query: ListPosProductsQuery,
): Promise<PosProductsListResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const where = query.activeOnly ? { isActive: true } : {};
    const [products, total] = await Promise.all([
      tx.posProduct.findMany({ where, orderBy: { name: "asc" } }),
      tx.posProduct.count({ where }),
    ]);
    return { data: products.map(toResponse), total };
  });
}

export async function createPosProduct(
  prisma: PrismaClient,
  clubId: string,
  input: CreatePosProductInput,
): Promise<PosProductResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const duplicate = await tx.posProduct.findFirst({
      where: { name: input.name, isActive: true },
      select: { id: true },
    });
    if (duplicate) throw new DuplicatePosProductNameError();

    const product = await tx.posProduct.create({
      data: {
        id: randomUUID(),
        name: input.name,
        priceCents: input.priceCents,
        category: input.category ?? null,
        stock: input.stock ?? null,
        updatedAt: new Date(),
      },
    });

    return toResponse(product);
  });
}

export async function updatePosProduct(
  prisma: PrismaClient,
  clubId: string,
  productId: string,
  input: UpdatePosProductInput,
): Promise<PosProductResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.posProduct.findUnique({
      where: { id: productId },
    });
    if (!existing) throw new PosProductNotFoundError();

    if (input.name !== undefined && input.name !== existing.name) {
      const duplicate = await tx.posProduct.findFirst({
        where: { name: input.name, isActive: true, id: { not: productId } },
        select: { id: true },
      });
      if (duplicate) throw new DuplicatePosProductNameError();
    }

    const updated = await tx.posProduct.update({
      where: { id: productId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.priceCents !== undefined && { priceCents: input.priceCents }),
        ...(input.category !== undefined && { category: input.category }),
        ...(input.stock !== undefined && { stock: input.stock }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    return toResponse(updated);
  });
}

export async function deletePosProduct(
  prisma: PrismaClient,
  clubId: string,
  productId: string,
): Promise<void> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.posProduct.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!existing) throw new PosProductNotFoundError();

    await tx.posProduct.update({
      where: { id: productId },
      data: { isActive: false },
    });
  });
}
