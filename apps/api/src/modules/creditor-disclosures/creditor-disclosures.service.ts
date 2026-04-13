import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import type { PrismaClient, Prisma } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { NotFoundError, ForbiddenError } from "../../lib/errors.js";
import type {
  CreateCreditorDisclosureInput,
  UpdateCreditorStatusInput,
  ListCreditorDisclosuresQuery,
  CreditorDisclosureResponse,
  CreditorDisclosuresListResult,
} from "./creditor-disclosures.schema.js";

function toResponse(row: {
  id: string;
  creditorName: string;
  description: string | null;
  amountCents: number;
  dueDate: Date;
  status: string;
  registeredBy: string;
  registeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): CreditorDisclosureResponse {
  return {
    id: row.id,
    creditorName: row.creditorName,
    description: row.description,
    amountCents: row.amountCents,
    dueDate: row.dueDate.toISOString().slice(0, 10),
    status: row.status as CreditorDisclosureResponse["status"],
    registeredBy: row.registeredBy,
    registeredAt: row.registeredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Creates a new creditor disclosure (passivo trabalhista).
 *
 * APPEND-ONLY by design (Lei 14.193/2021): no deletion is ever permitted.
 * `registeredBy` is always derived from the authenticated actorId — never
 * accepted from user input to prevent spoofing.
 * `status` is always initialised to "PENDING" — cannot be set at creation.
 */
export async function createCreditorDisclosure(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  input: CreateCreditorDisclosureInput,
): Promise<CreditorDisclosureResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const disclosure = await tx.creditorDisclosure.create({
      data: {
        creditorName: input.creditorName,
        description: input.description ?? null,
        amountCents: input.amountCents,
        dueDate: new Date(input.dueDate),
        status: "PENDING",
        registeredBy: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "CREDITOR_DISCLOSURE_CREATED",
        entityId: disclosure.id,
        entityType: "CreditorDisclosure",
        metadata: {
          creditorName: disclosure.creditorName,
          amountCents: disclosure.amountCents,
          dueDate: input.dueDate,
        },
      },
    });

    return toResponse(disclosure);
  });
}

/**
 * Returns a paginated list of creditor disclosures with optional status/date filters.
 *
 * Also returns `pendingTotalCents` — the sum of all PENDING disclosures across
 * the entire dataset (not limited by pagination). Used by the SAF KPI dashboard.
 *
 * Results ordered by dueDate ASC (oldest due date first — most urgent at top).
 */
export async function listCreditorDisclosures(
  prisma: PrismaClient,
  clubId: string,
  params: ListCreditorDisclosuresQuery,
): Promise<CreditorDisclosuresListResult> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const { page, limit, status, dueDateFrom, dueDateTo } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.CreditorDisclosureWhereInput = {
      ...(status !== undefined ? { status } : {}),
      ...(dueDateFrom !== undefined || dueDateTo !== undefined
        ? {
            dueDate: {
              ...(dueDateFrom !== undefined
                ? { gte: new Date(dueDateFrom) }
                : {}),
              ...(dueDateTo !== undefined ? { lte: new Date(dueDateTo) } : {}),
            },
          }
        : {}),
    };

    const [disclosures, total, pendingAggregate] = await Promise.all([
      tx.creditorDisclosure.findMany({
        where,
        orderBy: { dueDate: "asc" },
        skip,
        take: limit,
      }),
      tx.creditorDisclosure.count({ where }),
      tx.creditorDisclosure.aggregate({
        where: { status: "PENDING" },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      data: disclosures.map(toResponse),
      total,
      page,
      limit,
      pendingTotalCents: pendingAggregate._sum.amountCents ?? 0,
    };
  });
}

/**
 * Transitions a creditor disclosure's status (PENDING → SETTLED | DISPUTED).
 *
 * Constraints enforced here (Lei 14.193/2021):
 * - Throws `NotFoundError` if the disclosure does not exist in the tenant schema.
 * - Throws `ForbiddenError` if the current status is not PENDING (already settled/disputed).
 * - Only `status` is mutated — no other fields may be changed after creation.
 * - No DELETE path is provided anywhere in this module.
 */
export async function updateCreditorDisclosureStatus(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  disclosureId: string,
  input: UpdateCreditorStatusInput,
): Promise<CreditorDisclosureResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    const existing = await tx.creditorDisclosure.findUnique({
      where: { id: disclosureId },
      select: {
        id: true,
        status: true,
        creditorName: true,
        amountCents: true,
      },
    });

    if (!existing) {
      throw new NotFoundError("Passivo trabalhista não encontrado.");
    }

    if (existing.status !== "PENDING") {
      throw new ForbiddenError(
        `Passivo já está com status "${existing.status}" e não pode ser alterado novamente.`,
      );
    }

    const updated = await tx.creditorDisclosure.update({
      where: { id: disclosureId },
      data: { status: input.status },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "CREDITOR_DISCLOSURE_UPDATED",
        entityId: disclosureId,
        entityType: "CreditorDisclosure",
        metadata: {
          previousStatus: existing.status,
          newStatus: input.status,
          creditorName: existing.creditorName,
          amountCents: existing.amountCents,
        },
      },
    });

    return toResponse(updated);
  });
}

/**
 * Generates a PDF export of all creditor disclosures ordered by due date,
 * computes its SHA-256 hash for tamper-evidence (consistent with balance_sheets
 * module pattern, Lei 14.193/2021), records the export event in audit_log,
 * and returns the PDF buffer.
 *
 * The club name is fetched from the public schema (outside tenant schema)
 * to be included in the PDF header.
 *
 * @returns { buffer, hash, recordCount }
 */
export async function exportCreditorDisclosuresPdf(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
): Promise<{ buffer: Buffer; hash: string; recordCount: number }> {
  const disclosures = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.creditorDisclosure.findMany({
      orderBy: { dueDate: "asc" },
    });
  });

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { name: true },
  });

  const exportedAt = new Date();

  const buffer = await generateCreditorsPdf(
    disclosures,
    club?.name ?? "Clube",
    exportedAt,
  );

  const hash = createHash("sha256").update(buffer).digest("hex");

  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId,
        action: "CREDITOR_DISCLOSURE_UPDATED",
        entityType: "CreditorDisclosureExport",
        metadata: {
          exportType: "PDF",
          recordCount: disclosures.length,
          sha256Hash: hash,
          exportedAt: exportedAt.toISOString(),
        },
      },
    });
  });

  return { buffer, hash, recordCount: disclosures.length };
}

type DisclosureRow = {
  id: string;
  creditorName: string;
  description: string | null;
  amountCents: number;
  dueDate: Date;
  status: string;
  registeredAt: Date;
};

/**
 * Builds the PDF buffer for the creditor disclosures report.
 * Uses PDFKit with a clean tabular layout aligned with Brazilian SAF compliance requirements.
 * Returns a Promise<Buffer> because PDFKit uses Node.js streams.
 */
function generateCreditorsPdf(
  disclosures: DisclosureRow[],
  clubName: string,
  exportedAt: Date,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const formatBRL = (cents: number): string =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);

    const formatDate = (d: Date): string =>
      d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

    const statusLabel: Record<string, string> = {
      PENDING: "Pendente",
      SETTLED: "Liquidado",
      DISPUTED: "Em Disputa",
    };

    doc
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("Passivos Trabalhistas — SAF", { align: "center" });

    doc.fontSize(12).font("Helvetica").text(clubName, { align: "center" });

    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(`Exportado em: ${formatDate(exportedAt)} — Lei 14.193/2021`, {
        align: "center",
      })
      .moveDown(1.5)
      .fillColor("#000000");

    const pendingTotal = disclosures
      .filter((d) => d.status === "PENDING")
      .reduce((sum, d) => sum + d.amountCents, 0);

    const settledTotal = disclosures
      .filter((d) => d.status === "SETTLED")
      .reduce((sum, d) => sum + d.amountCents, 0);

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text(
        `Total de registros: ${disclosures.length}` +
          `   |   Pendente: ${formatBRL(pendingTotal)}` +
          `   |   Liquidado: ${formatBRL(settledTotal)}`,
      )
      .moveDown(1);

    const PAGE_WIDTH = 495;
    const ROW_HEIGHT = 20;
    const HEADER_BG = "#1a5276";
    const EVEN_ROW_BG = "#eaf0f6";
    const ODD_ROW_BG = "#ffffff";

    const cols = {
      n: { x: 50, w: 25 },
      name: { x: 78, w: 165 },
      amount: { x: 246, w: 90 },
      due: { x: 339, w: 75 },
      status: { x: 417, w: 78 },
    };

    let y = doc.y;

    doc.rect(50, y - 4, PAGE_WIDTH, ROW_HEIGHT).fill(HEADER_BG);

    doc.fillColor("#ffffff").fontSize(9).font("Helvetica-Bold");

    doc.text("#", cols.n.x, y, { width: cols.n.w });
    doc.text("Credor", cols.name.x, y, { width: cols.name.w });
    doc.text("Valor (R$)", cols.amount.x, y, {
      width: cols.amount.w,
      align: "right",
    });
    doc.text("Vencimento", cols.due.x, y, { width: cols.due.w });
    doc.text("Status", cols.status.x, y, { width: cols.status.w });

    y += ROW_HEIGHT;

    doc.fillColor("#000000").font("Helvetica").fontSize(8);

    disclosures.forEach((d, i) => {
      if (y > 750) {
        doc.addPage();
        y = 50;
      }

      const bg = i % 2 === 0 ? EVEN_ROW_BG : ODD_ROW_BG;
      doc
        .rect(50, y - 2, PAGE_WIDTH, ROW_HEIGHT - 2)
        .fill(bg)
        .fillColor("#000000");

      doc.text(String(i + 1), cols.n.x, y, { width: cols.n.w });
      doc.text(d.creditorName, cols.name.x, y, {
        width: cols.name.w,
        ellipsis: true,
      });
      doc.text(formatBRL(d.amountCents), cols.amount.x, y, {
        width: cols.amount.w,
        align: "right",
      });
      doc.text(formatDate(d.dueDate), cols.due.x, y, { width: cols.due.w });
      doc.text(statusLabel[d.status] ?? d.status, cols.status.x, y, {
        width: cols.status.w,
      });

      y += ROW_HEIGHT;
    });

    if (disclosures.length === 0) {
      doc
        .fontSize(10)
        .fillColor("#888888")
        .text("Nenhum passivo trabalhista registrado.", 50, y + 10, {
          align: "center",
          width: PAGE_WIDTH,
        });
    }

    doc
      .moveDown(2)
      .fontSize(8)
      .fillColor("#666666")
      .text(
        "Documento gerado automaticamente pelo ClubOS. " +
          "Verifique a autenticidade pelo hash SHA-256 registrado no sistema.",
        { align: "center" },
      );

    doc.end();
  });
}
