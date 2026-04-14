import type { PrismaClient } from "../../../generated/prisma/index.js";
import { getRevenueStatement } from "../../modules/revenue-statement/revenue-statement.service.js";
import type { RevenueStatementResponse } from "../../modules/revenue-statement/revenue-statement.schema.js";
import { getResendClient, getEmailFrom } from "../../lib/email.js";
import PDFDocument from "pdfkit";

export interface MonthlyReportResult {
  clubId: string;
  reportPeriod: string;
  adminCount: number;
  emailsSent: number;
  emailsFailed: number;
  skipped: boolean;
  skipReason?: string;
}

/**
 * Returns the [start, end] UTC Date range for the calendar month
 * immediately preceding `now`, along with the ISO "YYYY-MM" period string.
 *
 * Handles year boundaries correctly: calling with a January date
 * returns a December range for the prior year.
 *
 * @example now = 2025-04-02 → { periodStart: 2025-03-01T00:00:00.000Z,
 *                               periodEnd:   2025-03-31T23:59:59.999Z,
 *                               reportPeriod: "2025-03" }
 * @example now = 2025-01-02 → { periodStart: 2024-12-01T00:00:00.000Z,
 *                               periodEnd:   2024-12-31T23:59:59.999Z,
 *                               reportPeriod: "2024-12" }
 */
export function getPreviousMonthRange(now: Date = new Date()): {
  periodStart: Date;
  periodEnd: Date;
  reportPeriod: string;
} {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const reportYear = periodStart.getUTCFullYear();
  const reportMonth = String(periodStart.getUTCMonth() + 1).padStart(2, "0");

  return {
    periodStart,
    periodEnd,
    reportPeriod: `${reportYear}-${reportMonth}`,
  };
}

/**
 * Formats a Date to "DD/MM/YYYY" using the UTC timezone.
 * Used consistently throughout the PDF to avoid timezone-shifted dates.
 */
function formatDatePt(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/**
 * Converts a "YYYY-MM" report period string to a human-readable
 * Portuguese month-year string, e.g. "2025-03" → "Março 2025".
 */
function humanizePeriod(reportPeriod: string): string {
  const [yearStr, monthStr] = reportPeriod.split("-");
  if (!yearStr || !monthStr) return reportPeriod;
  const date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1));
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formats an integer cent value as a Brazilian Real currency string,
 * e.g. 149000 → "R$ 1.490,00".
 */
function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/**
 * Generates the monthly financial report PDF buffer using PDFKit.
 *
 * The PDF includes:
 *   - Club name and reporting period in the header
 *   - KPI cards: revenue, expenses, net result, pending+overdue, payment count
 *   - Charge breakdown: total / paid (inferred) / pending / overdue
 *   - Monthly detail table (single row for a one-month report)
 *   - Footer with generation timestamp and ClubOS branding
 *
 * Net result is rendered in green (≥ 0) or red (< 0) to match the
 * RevenueStatementPanel convention in the frontend.
 *
 * @returns Promise<Buffer> — stream-based PDFKit generation wrapped in a promise.
 */
export function generateMonthlyReportPdf(
  data: RevenueStatementResponse,
  clubName: string,
  reportPeriod: string,
  generatedAt: Date,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totals = data.totals;
    const humanPeriod = humanizePeriod(reportPeriod);
    const PAGE_WIDTH = 495;
    const HEADER_BG = "#1a5276";

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("RELATÓRIO FINANCEIRO MENSAL — CLUBOS", { align: "center" });

    doc.fontSize(13).font("Helvetica").text(clubName, { align: "center" });

    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `Período: ${humanPeriod.charAt(0).toUpperCase() + humanPeriod.slice(1)}   |   Gerado em: ${formatDatePt(generatedAt)}`,
        { align: "center" },
      )
      .moveDown(1)
      .fillColor("#000000");

    const cardLabels = [
      {
        label: "RECEITAS",
        value: formatBRL(totals.revenueCents),
        color: "#000000",
      },
      {
        label: "DESPESAS",
        value: formatBRL(totals.expensesCents),
        color: "#000000",
      },
      {
        label: "RESULTADO LÍQUIDO",
        value: formatBRL(totals.netCents),
        color: totals.netCents >= 0 ? "#1a7a2e" : "#c0392b",
      },
      {
        label: "PEND. + INADIMP.",
        value: formatBRL(totals.pendingCents + totals.overdueCents),
        color: "#000000",
      },
      {
        label: "PAGAMENTOS",
        value: String(totals.paymentCount),
        color: "#000000",
      },
    ];

    const CARD_W = 90;
    const CARD_H = 50;
    const CARD_GAP = 8;
    const CARDS_PER_ROW = 3;
    const cardRowStartX = 50;
    const cardY = doc.y;

    cardLabels.forEach((card, idx) => {
      const row = Math.floor(idx / CARDS_PER_ROW);
      const col = idx % CARDS_PER_ROW;
      const x = cardRowStartX + col * (CARD_W + CARD_GAP);
      const y = cardY + row * (CARD_H + 8);

      doc.rect(x, y, CARD_W, CARD_H).fill("#eaf0f6").fillColor("#000000");
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#555555")
        .text(card.label, x + 4, y + 5, { width: CARD_W - 8 });
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(card.color)
        .text(card.value, x + 4, y + 22, { width: CARD_W - 8 });
    });

    const rowsUsed = Math.ceil(cardLabels.length / CARDS_PER_ROW);
    doc.y = cardY + rowsUsed * (CARD_H + 8) + 12;
    doc.fillColor("#000000");

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("RESUMO DE COBRANÇAS", { underline: false });

    doc.moveDown(0.3).fontSize(9).font("Helvetica");

    const nonCancelledCount = totals.chargeCount;
    const pendingCount = data.periods.reduce((s, p) => s + p.chargeCount, 0);
    
    doc.text(
      `Total de cobranças (não canceladas): ${nonCancelledCount}   |   ` +
        `Pagamentos confirmados: ${totals.paymentCount}`,
    );
    doc.text(
      `Valor pendente: ${formatBRL(totals.pendingCents)}   |   ` +
        `Valor inadimplente: ${formatBRL(totals.overdueCents)}`,
    );
    doc.moveDown(0.8);

    const tableHeaders = [
      "Período",
      "Receitas",
      "Despesas",
      "Líquido",
      "Pendente",
      "Inadimp.",
    ];
    const colWidths = [70, 85, 85, 80, 80, 75];
    const colXs: number[] = [];
    let cx = 50;
    for (const w of colWidths) {
      colXs.push(cx);
      cx += w;
    }

    const ROW_HEIGHT = 18;
    let tableY = doc.y;

    doc.rect(50, tableY - 3, PAGE_WIDTH, ROW_HEIGHT).fill(HEADER_BG);
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
    tableHeaders.forEach((h, i) => {
      doc.text(h, colXs[i]!, tableY, {
        width: colWidths[i]!,
        align: i > 0 ? "right" : "left",
      });
    });
    tableY += ROW_HEIGHT;

    if (data.periods.length === 0) {
      doc
        .fillColor("#888888")
        .fontSize(9)
        .font("Helvetica")
        .text(
          "Nenhum dado financeiro registrado neste período.",
          50,
          tableY + 6,
          {
            align: "center",
            width: PAGE_WIDTH,
          },
        );
      tableY += 22;
    } else {
      data.periods.forEach((period, i) => {
        const bg = i % 2 === 0 ? "#eaf0f6" : "#ffffff";
        doc
          .rect(50, tableY - 2, PAGE_WIDTH, ROW_HEIGHT - 2)
          .fill(bg)
          .fillColor("#000000");
        doc.fontSize(8).font("Helvetica");

        const netColor = period.netCents >= 0 ? "#1a7a2e" : "#c0392b";

        doc
          .fillColor("#000000")
          .text(period.period, colXs[0]!, tableY, {
            width: colWidths[0]!,
            align: "left",
          });
        doc.text(formatBRL(period.revenueCents), colXs[1]!, tableY, {
          width: colWidths[1]!,
          align: "right",
        });
        doc.text(formatBRL(period.expensesCents), colXs[2]!, tableY, {
          width: colWidths[2]!,
          align: "right",
        });
        doc
          .fillColor(netColor)
          .text(formatBRL(period.netCents), colXs[3]!, tableY, {
            width: colWidths[3]!,
            align: "right",
          });
        doc
          .fillColor("#000000")
          .text(formatBRL(period.pendingCents), colXs[4]!, tableY, {
            width: colWidths[4]!,
            align: "right",
          });
        doc.text(formatBRL(period.overdueCents), colXs[5]!, tableY, {
          width: colWidths[5]!,
          align: "right",
        });

        tableY += ROW_HEIGHT;
      });
    }

    doc.y = tableY + 16;

    doc
      .fontSize(8)
      .fillColor("#666666")
      .text(
        "Documento gerado automaticamente pelo ClubOS. " +
          "Relatório informativo — não substitui demonstrativo financeiro oficial.",
        { align: "center" },
      );

    doc.end();
  });
}

/**
 * Sends the monthly report PDF to each admin email address via Resend.
 *
 * Uses the Resend SDK directly (not the `sendEmail` wrapper) because the
 * wrapper does not expose the `attachments` parameter. Each admin receives
 * a separate email for auditability — no BCC.
 *
 * Failures for individual recipients are caught and accumulated in `failed[]`
 * rather than aborting the entire send — a broken address for one admin
 * should not prevent the report from reaching the others.
 *
 * @returns { sent, failed } arrays of recipient email addresses.
 */
export async function sendMonthlyReportEmail(
  adminEmails: string[],
  pdfBuffer: Buffer,
  clubName: string,
  reportPeriod: string,
  clubId: string,
): Promise<{ sent: string[]; failed: string[] }> {
  if (adminEmails.length === 0) {
    return { sent: [], failed: [] };
  }

  const resend = getResendClient();
  const humanPeriod = humanizePeriod(reportPeriod);
  const capitalised =
    humanPeriod.charAt(0).toUpperCase() + humanPeriod.slice(1);

  const subject = `[ClubOS] Relatório Financeiro — ${capitalised} — ${clubName}`;
  const safeFilename = `relatorio-financeiro-${reportPeriod}-${clubId}.pdf`;

  const htmlBody = `
<div style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1a5276">Relatório Financeiro Mensal</h2>
  <p>Olá,</p>
  <p>O relatório financeiro do mês de <strong>${capitalised}</strong>
     para <strong>${clubName}</strong> está disponível em anexo.</p>
  <p>O documento PDF em anexo contém o resumo completo de receitas, despesas,
     resultado líquido e situação de cobranças do período.</p>
  <p style="font-size:12px;color:#666">
    Documento gerado automaticamente pelo ClubOS.<br>
    Este é um relatório informativo — não substitui demonstrativo financeiro oficial.
  </p>
</div>`.trim();

  const textBody =
    `Relatório Financeiro Mensal — ${capitalised} — ${clubName}\n\n` +
    `O relatório financeiro está disponível em anexo (PDF).\n\n` +
    `Documento gerado automaticamente pelo ClubOS.\n` +
    `Este é um relatório informativo — não substitui demonstrativo financeiro oficial.`;

  const sent: string[] = [];
  const failed: string[] = [];

  for (const to of adminEmails) {
    try {
      const { error } = await resend.emails.send({
        from: getEmailFrom(),
        to,
        subject,
        html: htmlBody,
        text: textBody,
        attachments: [
          {
            filename: safeFilename,
            content: pdfBuffer,
          },
        ],
      });
      if (error) {
        failed.push(to);
      } else {
        sent.push(to);
      }
    } catch {
      failed.push(to);
    }
  }

  return { sent, failed };
}

/**
 * Orchestrates the full monthly report pipeline for a single club:
 *   1. Fetches the club name and all ADMIN user emails (public schema).
 *   2. Bails out early if no ADMIN users have email addresses.
 *   3. Calls `getRevenueStatement()` with the exact prev-month boundaries
 *      (uses `from`/`to` mode — not `months` mode — to avoid boundary drift).
 *   4. Generates the PDF buffer via PDFKit.
 *   5. Emails the PDF to every ADMIN recipient.
 *   6. Returns a structured result for the BullMQ worker to log.
 *
 * @param prisma       Singleton Prisma client (not a transaction).
 * @param clubId       Tenant identifier.
 * @param periodStart  UTC start of the reporting month (00:00:00.000).
 * @param periodEnd    UTC end of the reporting month (23:59:59.999).
 * @param reportPeriod ISO "YYYY-MM" string identifying the reporting month.
 */
export async function generateAndSendMonthlyReport(
  prisma: PrismaClient,
  clubId: string,
  periodStart: Date,
  periodEnd: Date,
  reportPeriod: string,
): Promise<MonthlyReportResult> {
  const result: MonthlyReportResult = {
    clubId,
    reportPeriod,
    adminCount: 0,
    emailsSent: 0,
    emailsFailed: 0,
    skipped: false,
  };

  const [club, adminUsers] = await Promise.all([
    prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    }),
    prisma.user.findMany({
      where: { clubId, role: "ADMIN" },
      select: { email: true },
    }),
  ]);

  const adminEmails = adminUsers
    .map((u) => u.email)
    .filter((e): e is string => typeof e === "string" && e.length > 0);

  if (adminEmails.length === 0) {
    result.skipped = true;
    result.skipReason = "no admin emails";
    return result;
  }

  result.adminCount = adminEmails.length;
  const clubName = club?.name ?? "Clube";

  const from = periodStart.toISOString().slice(0, 10);
  const to = periodEnd.toISOString().slice(0, 10);

  const revenueData = await getRevenueStatement(prisma, clubId, { from, to });

  const generatedAt = new Date();
  const pdfBuffer = await generateMonthlyReportPdf(
    revenueData,
    clubName,
    reportPeriod,
    generatedAt,
  );

  const { sent, failed } = await sendMonthlyReportEmail(
    adminEmails,
    pdfBuffer,
    clubName,
    reportPeriod,
    clubId,
  );

  result.emailsSent = sent.length;
  result.emailsFailed = failed.length;

  return result;
}
