import type { PrismaClient } from "../../../generated/prisma/index.js";
import { provisionTenantSchema } from "../../lib/tenant-schema.js";
import { isPrismaUniqueConstraintError } from "../../lib/prisma.js";
import type { CreateClubInput, ClubResponse } from "./clubs.schema.js";

export class DuplicateSlugError extends Error {
  constructor() {
    super("A club with this slug already exists");
    this.name = "DuplicateSlugError";
  }
}

export class DuplicateCnpjError extends Error {
  constructor() {
    super("A club with this CNPJ is already registered");
    this.name = "DuplicateCnpjError";
  }
}

export async function createClub(
  prisma: PrismaClient,
  input: CreateClubInput,
): Promise<ClubResponse> {
  let club: ClubResponse;

  try {
    club = await prisma.club.create({
      data: {
        name: input.name,
        slug: input.slug,
        cnpj: input.cnpj ?? null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        cnpj: true,
        planTier: true,
        createdAt: true,
      },
    });
  } catch (err) {
    if (isPrismaUniqueConstraintError(err)) {
      const slugExists = await prisma.club.findUnique({
        where: { slug: input.slug },
        select: { id: true },
      });
      if (slugExists) throw new DuplicateSlugError();
      throw new DuplicateCnpjError();
    }
    throw err;
  }

  try {
    await provisionTenantSchema(prisma, club.id);
  } catch (err) {
    await prisma.club.delete({ where: { id: club.id } }).catch(() => {});
    throw err;
  }

  return club;
}
