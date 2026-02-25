/**
 * Unit tests for uploadClubLogo (T-004).
 *
 * All external I/O (sharp, prisma, saveFile) is mocked so tests run without
 * a real database, filesystem, or native binaries.
 *
 * Existing createClub tests live in a sibling describe block so both service
 * functions are covered in one file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createClub,
  uploadClubLogo,
  DuplicateSlugError,
  DuplicateCnpjError,
  ClubNotFoundError,
  InvalidImageError,
} from "../clubs.service.js";
import type { CreateClubInput } from "../clubs.schema.js";

vi.mock("../../../lib/tenant-schema.js", () => ({
  provisionTenantSchema: vi.fn(),
}));

vi.mock("../../../lib/prisma.js", () => ({
  isPrismaUniqueConstraintError: (err: unknown) =>
    (err as { code?: string })?.code === "P2002",
}));

vi.mock("../../../lib/storage.js", () => ({
  saveFile: vi.fn().mockImplementation(async (filename: string) => {
    return `http://localhost:3001/uploads/${filename}`;
  }),
}));

const sharpInstance = {
  metadata: vi.fn().mockResolvedValue({ width: 500, height: 500 }),
  resize: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  toBuffer: vi.fn().mockResolvedValue(Buffer.from("processed-webp")),
};

vi.mock("sharp", () => ({
  default: vi.fn(() => sharpInstance),
}));

import { provisionTenantSchema } from "../../../lib/tenant-schema.js";
import { saveFile } from "../../../lib/storage.js";
import sharp from "sharp";

const CLUB_ID = "clxyz1234567890abcdef";
const ACTOR_CLUB_ID = CLUB_ID;

const validJpegBuffer = Buffer.from("fake-jpeg-bytes");

function makeClubRow(overrides = {}) {
  return {
    id: CLUB_ID,
    name: "Clube Atlético Exemplo",
    slug: "atletico-exemplo",
    cnpj: null as string | null,
    planTier: "starter",
    createdAt: new Date("2025-03-01T08:00:00.000Z"),
    ...overrides,
  };
}

function makePrisma(overrides?: {
  clubCreate?: ReturnType<typeof makeClubRow> | Error;
  clubFindUnique?: { id: string } | null;
  clubDelete?: void;
  clubUpdate?: { id: string } | Error;
}) {
  const create =
    overrides?.clubCreate instanceof Error
      ? vi.fn().mockRejectedValue(overrides.clubCreate)
      : vi.fn().mockResolvedValue(overrides?.clubCreate ?? makeClubRow());

  const findUnique = vi
    .fn()
    .mockResolvedValue(overrides?.clubFindUnique ?? null);

  const del = vi.fn().mockResolvedValue(undefined);

  const update =
    overrides?.clubUpdate instanceof Error
      ? vi.fn().mockRejectedValue(overrides.clubUpdate)
      : vi.fn().mockResolvedValue(overrides?.clubUpdate ?? { id: CLUB_ID });

  return {
    club: { create, findUnique, delete: del, update },
  } as unknown as import("../../../../generated/prisma/index.js").PrismaClient;
}

const validInput: CreateClubInput = {
  name: "Clube Atlético Exemplo",
  slug: "atletico-exemplo",
};

beforeEach(() => {
  vi.mocked(provisionTenantSchema).mockResolvedValue(undefined);
  sharpInstance.metadata.mockResolvedValue({ width: 500, height: 500 });
  sharpInstance.toBuffer.mockResolvedValue(Buffer.from("processed-webp"));
  vi.mocked(sharp).mockReturnValue(sharpInstance as never);
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
      clubFindUnique: { id: "existing-id" },
    });

    await expect(createClub(prisma, validInput)).rejects.toBeInstanceOf(
      DuplicateSlugError,
    );
  });

  it("throws DuplicateCnpjError when cnpj already exists (slug is free)", async () => {
    const p2002 = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
    });
    const prisma = makePrisma({ clubCreate: p2002, clubFindUnique: null });

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

describe("uploadClubLogo", () => {
  describe("happy paths", () => {
    it("processes a JPEG and returns a logoUrl", async () => {
      const prisma = makePrisma();

      const result = await uploadClubLogo(
        prisma,
        CLUB_ID,
        ACTOR_CLUB_ID,
        "image/jpeg",
        validJpegBuffer,
      );

      expect(result).toEqual({
        logoUrl: `http://localhost:3001/uploads/logo-${CLUB_ID}.webp`,
      });
    });

    it("calls sharp with resize(200, 200, { fit: cover }) and webp({ quality: 85 })", async () => {
      const prisma = makePrisma();

      await uploadClubLogo(
        prisma,
        CLUB_ID,
        ACTOR_CLUB_ID,
        "image/jpeg",
        validJpegBuffer,
      );

      expect(sharpInstance.resize).toHaveBeenCalledWith(200, 200, {
        fit: "cover",
        position: "centre",
      });
      expect(sharpInstance.webp).toHaveBeenCalledWith({ quality: 85 });
    });

    it("persists with the deterministic filename logo-{clubId}.webp", async () => {
      const prisma = makePrisma();

      await uploadClubLogo(
        prisma,
        CLUB_ID,
        ACTOR_CLUB_ID,
        "image/jpeg",
        validJpegBuffer,
      );

      expect(saveFile).toHaveBeenCalledWith(
        `logo-${CLUB_ID}.webp`,
        expect.any(Buffer),
      );
    });

    it("updates club.logoUrl in the database", async () => {
      const prisma = makePrisma();

      await uploadClubLogo(
        prisma,
        CLUB_ID,
        ACTOR_CLUB_ID,
        "image/jpeg",
        validJpegBuffer,
      );

      expect(prisma.club.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CLUB_ID },
          data: { logoUrl: expect.stringContaining(`logo-${CLUB_ID}.webp`) },
        }),
      );
    });

    it("accepts image/png", async () => {
      const prisma = makePrisma();
      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          ACTOR_CLUB_ID,
          "image/png",
          validJpegBuffer,
        ),
      ).resolves.toHaveProperty("logoUrl");
    });

    it("accepts image/webp", async () => {
      const prisma = makePrisma();
      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          ACTOR_CLUB_ID,
          "image/webp",
          validJpegBuffer,
        ),
      ).resolves.toHaveProperty("logoUrl");
    });

    it("accepts image/gif (animation stripped by sharp — acceptable for logos)", async () => {
      const prisma = makePrisma();
      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          ACTOR_CLUB_ID,
          "image/gif",
          validJpegBuffer,
        ),
      ).resolves.toHaveProperty("logoUrl");
    });
  });

  describe("tenant boundary", () => {
    it("throws ClubNotFoundError when actorClubId does not match clubId", async () => {
      const prisma = makePrisma();

      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          "different-club-id-xyz",
          "image/jpeg",
          validJpegBuffer,
        ),
      ).rejects.toBeInstanceOf(ClubNotFoundError);
    });

    it("does not call sharp or the DB when tenant check fails", async () => {
      const prisma = makePrisma();

      await uploadClubLogo(
        prisma,
        CLUB_ID,
        "different-club-id-xyz",
        "image/jpeg",
        validJpegBuffer,
      ).catch(() => {});

      expect(sharp).not.toHaveBeenCalled();
      expect(prisma.club.update).not.toHaveBeenCalled();
    });
  });

  describe("file size validation", () => {
    it("throws InvalidImageError for buffers over 5 MB", async () => {
      const prisma = makePrisma();
      const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);

      await expect(
        uploadClubLogo(prisma, CLUB_ID, ACTOR_CLUB_ID, "image/jpeg", oversized),
      ).rejects.toBeInstanceOf(InvalidImageError);
    });

    it("accepts buffers exactly at 5 MB", async () => {
      const prisma = makePrisma();
      const exactly5mb = Buffer.alloc(5 * 1024 * 1024);

      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          ACTOR_CLUB_ID,
          "image/jpeg",
          exactly5mb,
        ),
      ).resolves.toHaveProperty("logoUrl");
    });
  });

  describe("MIME type validation", () => {
    it.each([
      "text/plain",
      "application/pdf",
      "image/svg+xml",
      "application/octet-stream",
    ])(
      "throws InvalidImageError for unsupported MIME type: %s",
      async (mime) => {
        const prisma = makePrisma();

        await expect(
          uploadClubLogo(prisma, CLUB_ID, ACTOR_CLUB_ID, mime, validJpegBuffer),
        ).rejects.toBeInstanceOf(InvalidImageError);
      },
    );

    it("error message mentions the accepted formats", async () => {
      const prisma = makePrisma();

      const err = await uploadClubLogo(
        prisma,
        CLUB_ID,
        ACTOR_CLUB_ID,
        "text/plain",
        validJpegBuffer,
      ).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InvalidImageError);
      expect((err as InvalidImageError).message).toMatch(/JPG|PNG|WebP|GIF/);
    });
  });

  describe("image decode validation", () => {
    it("throws InvalidImageError when sharp.metadata() rejects (corrupt file)", async () => {
      sharpInstance.metadata.mockRejectedValueOnce(
        new Error("Input buffer contains unsupported image format"),
      );

      const prisma = makePrisma();

      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          ACTOR_CLUB_ID,
          "image/jpeg",
          Buffer.from("not-an-image"),
        ),
      ).rejects.toBeInstanceOf(InvalidImageError);
    });

    it("does not call prisma.update when the image is corrupt", async () => {
      sharpInstance.metadata.mockRejectedValueOnce(new Error("decode failed"));

      const prisma = makePrisma();

      await uploadClubLogo(
        prisma,
        CLUB_ID,
        ACTOR_CLUB_ID,
        "image/jpeg",
        Buffer.from("garbage"),
      ).catch(() => {});

      expect(prisma.club.update).not.toHaveBeenCalled();
    });
  });

  describe("database update failure", () => {
    it("throws ClubNotFoundError when prisma update rejects with P2025", async () => {
      const p2025 = Object.assign(new Error("Record not found"), {
        code: "P2025",
      });
      const prisma = makePrisma({ clubUpdate: p2025 });

      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          ACTOR_CLUB_ID,
          "image/jpeg",
          validJpegBuffer,
        ),
      ).rejects.toBeInstanceOf(ClubNotFoundError);
    });

    it("re-throws unexpected prisma errors as-is", async () => {
      const dbError = Object.assign(new Error("Connection timeout"), {
        code: "P1001",
      });
      const prisma = makePrisma({ clubUpdate: dbError });

      await expect(
        uploadClubLogo(
          prisma,
          CLUB_ID,
          ACTOR_CLUB_ID,
          "image/jpeg",
          validJpegBuffer,
        ),
      ).rejects.toThrow("Connection timeout");
    });
  });
});
