import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { getUploadDir, getStorageBaseUrl } from "../../lib/storage.js";
import { assertSafePath } from "../../lib/file-validation.js";
import type {
  UploadBalanceSheetInput,
  BalanceSheetResponse,
  BalanceSheetsListResponse,
} from "./balance-sheets.schema.js";

/**
 * Computes the SHA-256 hex digest of a buffer.
 * Stored alongside the PDF URL as tamper-evidence (Lei 14.193/2021).
 */
function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Persists a PDF buffer under uploads/balance-sheets/{clubId}/ and returns
 * the public URL.
 */
async function savePdfFile(clubId: string, buffer: Buffer): Promise<string> {
  const filename = `${randomUUID()}.pdf`;
  const subdir = join("balance-sheets", clubId);

  assertSafePath(getUploadDir(), join(subdir, filename));

  const fullDir = join(getUploadDir(), subdir);
  await mkdir(fullDir, { recursive: true });
  await writeFile(join(fullDir, filename), buffer);

  const urlPath = ["balance-sheets", clubId, filename].join("/");
  return `${getStorageBaseUrl()}/uploads/${urlPath}`;
}

/**
 * Maps a raw Prisma BalanceSheet row to the API response shape.
 */
function toResponse(row: {
  id: string;
  title: string;
  period: string;
  fileUrl: string;
  fileHash: string;
  publishedAt: Date;
}): BalanceSheetResponse {
  return {
    id: row.id,
    title: row.title,
    period: row.period,
    fileUrl: row.fileUrl,
    fileHash: row.fileHash,
    publishedAt: row.publishedAt.toISOString(),
  };
}

/**
 * Validates, stores and publishes a PDF balance sheet for a club.
 * Append-only — no UPDATE or DELETE issued on balance_sheets.
 */
export async function publishBalanceSheet(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: UploadBalanceSheetInput,
  pdfBuffer: Buffer,
): Promise<BalanceSheetResponse> {
  const fileHash = computeSha256(pdfBuffer);
  const fileUrl = await savePdfFile(clubId, pdfBuffer);

  return withTenantSchema(prisma, clubId, async (tx) => {
    const sheet = await tx.balanceSheet.create({
      data: {
        title: input.title,
        period: input.period,
        fileUrl,
        fileHash,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "BALANCE_SHEET_PUBLISHED",
        entityId: sheet.id,
        entityType: "BalanceSheet",
        metadata: {
          title: input.title,
          period: input.period,
          fileHash,
          fileUrl,
        },
      },
    });

    return toResponse(sheet);
  });
}

/**
 * Returns all published balance sheets for a club identified by its slug.
 * Public endpoint — returns empty list for unknown slugs.
 */
export async function listBalanceSheetsByClubSlug(
  prisma: PrismaClient,
  slug: string,
): Promise<BalanceSheetsListResponse> {
  const club = await prisma.club.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!club) {
    return { data: [], total: 0 };
  }

  return withTenantSchema(prisma, club.id, async (tx) => {
    const [sheets, total] = await Promise.all([
      tx.balanceSheet.findMany({ orderBy: { publishedAt: "desc" } }),
      tx.balanceSheet.count(),
    ]);
    return { data: sheets.map(toResponse), total };
  });
}

/**
 * Returns all published balance sheets for an authenticated club.
 *
 * Takes `clubId` directly from the JWT — used by the admin panel list endpoint.
 * Results ordered newest-first (publishedAt DESC).
 */
export async function listBalanceSheetsForClub(
  prisma: PrismaClient,
  clubId: string,
): Promise<BalanceSheetsListResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const [sheets, total] = await Promise.all([
      tx.balanceSheet.findMany({ orderBy: { publishedAt: "desc" } }),
      tx.balanceSheet.count(),
    ]);
    return { data: sheets.map(toResponse), total };
  });
}
