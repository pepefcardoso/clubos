import sharp from "sharp";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { provisionTenantSchema } from "../../lib/tenant-schema.js";
import { isPrismaUniqueConstraintError } from "../../lib/prisma.js";
import { saveFile } from "../../lib/storage.js";
import { sendEmail } from "../../lib/email.js";
import { buildWelcomeEmail } from "./email-templates/welcome.js";
import type { CreateClubInput, ClubResponse } from "./clubs.schema.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../lib/errors.js";
import {
  validateImageMagicBytes,
  InvalidMagicBytesError,
} from "../../lib/file-validation.js";

export class DuplicateSlugError extends ConflictError {
  constructor() {
    super("Um clube com este slug já está cadastrado");
  }
}

export class DuplicateCnpjError extends ConflictError {
  constructor() {
    super("Um clube com este CNPJ já está cadastrado");
  }
}

export class ClubNotFoundError extends NotFoundError {
  constructor() {
    super("Clube não encontrado");
  }
}

export class InvalidImageError extends ValidationError {
  constructor(reason: string) {
    super(reason);
  }
}

export async function createClub(
  prisma: PrismaClient,
  input: CreateClubInput,
  adminEmail?: string,
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

  if (adminEmail) {
    sendWelcomeEmail(adminEmail, club.name).catch((err) => {
      console.warn("[email] Failed to send welcome email:", err);
    });
  }

  return club;
}

/**
 * Sends a transactional welcome email to the club's admin after onboarding.
 *
 * This is fire-and-forget from the perspective of the HTTP handler —
 * a send failure logs a warning but does NOT roll back the club creation.
 */
export async function sendWelcomeEmail(
  adminEmail: string,
  clubName: string,
): Promise<void> {
  const dashboardUrl = process.env["APP_URL"] ?? "https://app.clubos.com.br";
  const { subject, html, text } = buildWelcomeEmail({
    clubName,
    adminEmail,
    dashboardUrl,
  });
  await sendEmail({ to: adminEmail, subject, html, text });
}

export interface UploadLogoResult {
  logoUrl: string;
}

/**
 * Declared MIME type allowlist — fast early-exit before the async
 * magic bytes check. Must stay in sync with ALLOWED_IMAGE_MIME_TYPES
 * in file-validation.ts.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Validates, resizes, and persists a club logo.
 *
 * Pipeline:
 *  1. Tenant boundary guard — actorClubId (from JWT) must match clubId
 *  2. File-size check (belt-and-suspenders; multipart plugin already limits)
 *  3. MIME type allowlist — declared Content-Type fast-fail
 *  4. Magic bytes check — validates binary content, not client-declared MIME
 *     (catches disguised files: HTML/PDF/SVG sent as image/jpeg)
 *  5. sharp.metadata() probe — rejects corrupt/truncated images
 *  6. Resize to 200×200px WebP (cover fit, quality 85)
 *  7. Persist via saveFile() — deterministic filename overwrites previous logo
 *  8. Update club.logoUrl in the database
 *
 * @throws ClubNotFoundError  when clubId ≠ actorClubId or club row is missing
 * @throws InvalidImageError  on size/format/decode failures
 */
export async function uploadClubLogo(
  prisma: PrismaClient,
  clubId: string,
  actorClubId: string,
  mimetype: string,
  buffer: Buffer,
): Promise<UploadLogoResult> {
  if (clubId !== actorClubId) {
    throw new ClubNotFoundError();
  }

  if (buffer.length > MAX_LOGO_SIZE_BYTES) {
    throw new InvalidImageError("Arquivo excede o limite de 5 MB");
  }

  if (!ALLOWED_MIME_TYPES.has(mimetype)) {
    throw new InvalidImageError(
      "Formato inválido. Envie uma imagem JPG, PNG, WebP ou GIF",
    );
  }

  try {
    await validateImageMagicBytes(buffer);
  } catch (err) {
    if (err instanceof InvalidMagicBytesError) {
      throw new InvalidImageError(err.message);
    }
    throw err;
  }

  try {
    await sharp(buffer).metadata();
  } catch {
    throw new InvalidImageError("Não foi possível processar a imagem enviada");
  }

  const processed = await sharp(buffer)
    .resize(200, 200, { fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .toBuffer();

  const filename = `logo-${clubId}.webp`;
  const logoUrl = await saveFile(filename, processed);

  try {
    await prisma.club.update({
      where: { id: clubId },
      data: { logoUrl },
      select: { id: true },
    });
  } catch (err) {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === "P2025") {
      throw new ClubNotFoundError();
    }
    throw err;
  }

  return { logoUrl };
}
