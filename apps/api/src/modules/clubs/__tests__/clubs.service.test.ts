/**
 * Unit tests for createClub (T-002).
 *
 * All Prisma and provisionTenantSchema calls are mocked so these tests run
 * without a real database. Integration coverage (actual schema provisioning)
 * is provided by tenant-schema.test.ts (T-001).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createClub,
  DuplicateSlugError,
  DuplicateCnpjError,
} from "../clubs.service.js";
import type { CreateClubInput } from "../clubs.schema.js";

vi.mock("../../../lib/tenant-schema.js", () => ({
  provisionTenantSchema: vi.fn(),
}));

vi.mock("../../../lib/prisma.js", () => ({
  isPrismaUniqueConstraintError: (err: unknown) =>
    (err as { code?: string })?.code === "P2002",
}));

import { provisionTenantSchema } from "../../../lib/tenant-schema.js";

interface ClubRow {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  planTier: string;
  createdAt: Date;
}

function makeClubRow(overrides?: Partial<ClubRow>): ClubRow {
  return {
    id: "clxyz1234567890abcdef",
    name: "Clube Atlético Exemplo",
    slug: "atletico-exemplo",
    cnpj: null,
    planTier: "starter",
    createdAt: new Date("2025-03-01T08:00:00.000Z"),
    ...overrides,
  };
}

function makePrisma(overrides?: {
  clubCreate?: ReturnType<typeof makeClubRow> | Error;
  clubFindUnique?: { id: string } | null;
  clubDelete?: void;
}) {
  const create =
    overrides?.clubCreate instanceof Error
      ? vi.fn().mockRejectedValue(overrides.clubCreate)
      : vi.fn().mockResolvedValue(overrides?.clubCreate ?? makeClubRow());

  const findUnique = vi
    .fn()
    .mockResolvedValue(overrides?.clubFindUnique ?? null);
  const del = vi.fn().mockResolvedValue(undefined);

  return {
    club: { create, findUnique, delete: del },
  } as unknown as import("../../../../generated/prisma/index.js").PrismaClient;
}

const validInput: CreateClubInput = {
  name: "Clube Atlético Exemplo",
  slug: "atletico-exemplo",
};

beforeEach(() => {
  vi.mocked(provisionTenantSchema).mockResolvedValue(undefined);
});

describe("createClub", () => {
  it("creates a club with name and slug — returns 201-shape response", async () => {
    const prisma = makePrisma();
    const result = await createClub(prisma, validInput);

    expect(result).toMatchObject({
      id: expect.any(String),
      name: "Clube Atlético Exemplo",
      slug: "atletico-exemplo",
      cnpj: null,
      planTier: "starter",
      createdAt: expect.any(Date),
    });
  });

  it("calls provisionTenantSchema exactly once with the new club id", async () => {
    const prisma = makePrisma();
    const result = await createClub(prisma, validInput);

    expect(provisionTenantSchema).toHaveBeenCalledOnce();
    expect(provisionTenantSchema).toHaveBeenCalledWith(prisma, result.id);
  });

  it("creates a club with an optional cnpj", async () => {
    const row = makeClubRow({ cnpj: "12345678000195" });
    const prisma = makePrisma({ clubCreate: row });

    const result = await createClub(prisma, {
      ...validInput,
      cnpj: "12345678000195",
    });

    expect(result.cnpj).toBe("12345678000195");
    expect(prisma.club.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cnpj: "12345678000195" }),
      }),
    );
  });

  it("stores cnpj as null when not provided", async () => {
    const prisma = makePrisma();
    await createClub(prisma, validInput);

    expect(prisma.club.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cnpj: null }),
      }),
    );
  });

  it("throws DuplicateSlugError when slug already exists", async () => {
    const p2002 = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
    });
    const prisma = makePrisma({
      clubCreate: p2002,
      clubFindUnique: { id: "existing-id" }, // slug exists
    });

    await expect(createClub(prisma, validInput)).rejects.toBeInstanceOf(
      DuplicateSlugError,
    );
  });

  it("throws DuplicateCnpjError when cnpj already exists (slug is free)", async () => {
    const p2002 = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
    });
    const prisma = makePrisma({
      clubCreate: p2002,
      clubFindUnique: null,
    });

    await expect(
      createClub(prisma, { ...validInput, cnpj: "12345678000195" }),
    ).rejects.toBeInstanceOf(DuplicateCnpjError);
  });

  it("deletes the club row and re-throws when provisionTenantSchema fails", async () => {
    const provisionError = new Error("DDL failed");
    vi.mocked(provisionTenantSchema).mockRejectedValueOnce(provisionError);

    const row = makeClubRow();
    const prisma = makePrisma({ clubCreate: row });

    await expect(createClub(prisma, validInput)).rejects.toThrow("DDL failed");

    expect(prisma.club.delete).toHaveBeenCalledWith({ where: { id: row.id } });
  });

  it("still throws the original error even if the compensating delete also fails", async () => {
    const provisionError = new Error("DDL failed");
    vi.mocked(provisionTenantSchema).mockRejectedValueOnce(provisionError);

    const row = makeClubRow();
    const prisma = makePrisma({ clubCreate: row });
    vi.mocked(prisma.club.delete).mockRejectedValueOnce(
      new Error("delete also failed"),
    );

    await expect(createClub(prisma, validInput)).rejects.toThrow("DDL failed");
  });

  it("re-throws unexpected database errors as-is", async () => {
    const dbError = new Error("Connection timeout");
    const prisma = makePrisma({ clubCreate: dbError });

    await expect(createClub(prisma, validInput)).rejects.toThrow(
      "Connection timeout",
    );
    expect(provisionTenantSchema).not.toHaveBeenCalled();
  });
});
