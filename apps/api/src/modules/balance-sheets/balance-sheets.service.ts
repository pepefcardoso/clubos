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
 *
 * Each upload gets a UUID filename so filenames from different clubs never
 * collide, and there is no way to enumerate other clubs' documents.
 */
async function savePdfFile(clubId: string, buffer: Buffer): Promise<string> {
  const filename = `${randomUUID()}.pdf`;
  const subdir = join("balance-sheets", clubId);

  assertSafePath(getUploadDir(), join(subdir, filename));

  const fullDir = join(getUploadDir(), subdir);
  await mkdir(fullDir, { recursive: true });
  await writeFile(join(fullDir, filename), buffer);

  return `${getStorageBaseUrl()}/uploads/${subdir}/${filename}`;
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
 *
 * Steps:
 *  1. Compute SHA-256 hash of the raw PDF bytes.
 *  2. Write the file to disk under uploads/balance-sheets/{clubId}/.
 *  3. Create the balance_sheets row inside the tenant schema.
 *  4. Write an AuditLog entry.
 *
 * The returned row is immediately queryable by the public listing endpoint.
 * No UPDATE or DELETE is ever issued on this table — append-only by design.
 *
 * @throws Re-throws any filesystem or database errors to the route handler.
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
 *
 * Resolves the club from the public schema first (slug → clubId), then queries
 * the tenant schema. Returns an empty list (not an error) when the slug is
 * unknown — the public page should render an empty state, not a 404.
 *
 * Results are ordered newest-first (publishedAt DESC).
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
      tx.balanceSheet.findMany({
        orderBy: { publishedAt: "desc" },
      }),
      tx.balanceSheet.count(),
    ]);

    return { data: sheets.map(toResponse), total };
  });
}
