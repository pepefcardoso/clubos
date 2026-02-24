import { PrismaClient } from "../../generated/prisma/index.js";

let _client: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      log:
        process.env["NODE_ENV"] === "development"
          ? ["query", "warn", "error"]
          : ["warn", "error"],
    });
  }
  return _client;
}

export async function withTenantSchema<T>(
  prisma: PrismaClient,
  clubId: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  const schemaName = `clube_${clubId}`;

  return prisma.$transaction(async (tx) => {
    await (tx as unknown as PrismaClient).$executeRawUnsafe(
      `SET search_path TO "${schemaName}", public`,
    );
    return fn(tx as unknown as PrismaClient);
  });
}

/**
 * Returns true if the given error is a Prisma unique constraint violation (P2002).
 * Exported here so it can be shared across service modules without duplication.
 */
export function isPrismaUniqueConstraintError(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}
