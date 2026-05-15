import PDFDocument from "pdfkit";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import { Prisma } from "../../../generated/prisma/index.js";
import { getResendClient, getEmailFrom } from "../../lib/email.js";
import { appendCommunicationLog } from "../../modules/scoutlink/communication/communication-log.service.js";

export interface CurationReportResult {
  scoutId: string;
  yearMonth: string;
  athleteCount: number;
  emailSent: boolean;
  skipped: boolean;
  skipReason?: string;
}

type CurationAthleteRow = {
  id: string;
  athleteId: string;
  clubId: string;
  tier: string;
  snapshot: unknown;
};

type ScoutFilters = {
  targetPositions: string[];
};

/**
 * Converts a "YYYY-MM" string to a human-readable Portuguese month-year string,
 * e.g. "2025-03" → "Março 2025".
 */
function humanizeYearMonth(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split("-");
  if (!yearStr || !monthStr) return yearMonth;
  const date = new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, 1));
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Verifies a scout subscription is currently active and not expired.
 * Re-checked inside the worker (not just at dispatch time) because the
 * subscription may lapse between fan-out enqueue and job execution.
 */
export function isActiveSubscription(
  status: string,
  expiresAt: Date | null,
): boolean {
  return status === "ACTIVE" && expiresAt != null && expiresAt > new Date();
}

/**
 * Queries the top 20 published scout_showcases from the public schema,
 * filtered by the scout's saved position preferences.
 *
 * No withTenantSchema needed — scout_showcases is a public-schema table.
 * Full PREMIUM projection is applied (caller must have verified subscription).
 * Ordered by publishedAt DESC to surface the most recently published athletes.
 */
async function queryTopAthletes(
  prisma: PrismaClient,
  filters: ScoutFilters,
): Promise<CurationAthleteRow[]> {
  const posFilter =
    filters.targetPositions.length > 0
      ? Prisma.sql`AND ss.snapshot->>'position' = ANY(${filters.targetPositions}::text[])`
      : Prisma.sql``;

  return prisma.$queryRaw<CurationAthleteRow[]>`
    SELECT
      ss.id,
      ss."clubId",
      ss."athleteId",
      ss.tier::text,
      ss.snapshot
    FROM scout_showcases ss
    WHERE ss."isPublished" = true
      ${posFilter}
    ORDER BY ss."publishedAt" DESC
    LIMIT 20
  `;
}

type SnapshotShape = {
  name?: string;
  position?: string | null;
  ageYears?: number;
  rtpStatus?: string | null;
  acwrTrend?: Array<{ acwrRatio: number | null; riskZone: string }>;
  evaluationScores?: {
    technique: number;
    tactical: number;
    physical: number;
    mental: number;
    attitude: number;
  } | null;
};

/**
 * Generates the monthly scout curation report PDF buffer using PDFKit.
 *
 * Layout:
 *   - Header: scout name, reporting month, generation timestamp
 *   - One card per athlete (up to 20): initials, position, age, RTP status,
 *     latest ACWR ratio + risk zone, evaluation score radar summary
 *   - Footer: ClubOS branding + informational disclaimer
 *
 * Stream-to-Buffer via the standard doc.on('data')/doc.on('end') Promise
 * pattern established in monthly-report.service.ts.
 */
export function generateCurationPdf(
  athletes: CurationAthleteRow[],
  scoutName: string,
  yearMonth: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const humanPeriod = humanizeYearMonth(yearMonth);
    const capitalised =
      humanPeriod.charAt(0).toUpperCase() + humanPeriod.slice(1);
    const generatedAt = new Date().toLocaleDateString("pt-BR", {
      timeZone: "UTC",
    });
    const HEADER_BG = "#1a5276";
    const PAGE_WIDTH = 495;

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("RELATÓRIO DE CURADORIA — SCOUTLINK", { align: "center" });

    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Scout: ${scoutName}`, { align: "center" });

    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `Período: ${capitalised}   |   Gerado em: ${generatedAt}   |   Top ${athletes.length} atletas`,
        { align: "center" },
      )
      .moveDown(1)
      .fillColor("#000000");

    const CARD_H = 70;
    const CARD_GAP = 8;
    const CARD_W = PAGE_WIDTH;
    const LABEL_COL = 50;

    athletes.forEach((athlete, idx) => {
      const snap = (athlete.snapshot ?? {}) as SnapshotShape;
      const initials = (snap.name ?? "?")
        .trim()
        .split(/\s+/)
        .map((w: string) => (w[0] ?? "").toUpperCase())
        .join("");

      const latestAcwr = snap.acwrTrend?.at(-1);
      const acwrText =
        latestAcwr?.acwrRatio != null
          ? `${latestAcwr.acwrRatio.toFixed(2)} (${latestAcwr.riskZone})`
          : "N/D";

      const scores = snap.evaluationScores;
      const scoresText = scores
        ? `Téc ${scores.technique} · Tát ${scores.tactical} · Fís ${scores.physical} · Men ${scores.mental} · Ati ${scores.attitude}`
        : "N/D";

      if (doc.y + CARD_H + CARD_GAP > 780) {
        doc.addPage();
      }

      const cardY = doc.y;
      const bg = idx % 2 === 0 ? "#eaf0f6" : "#f9f9f9";
      doc.rect(LABEL_COL, cardY, CARD_W, CARD_H).fill(bg).fillColor("#000000");

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor(HEADER_BG)
        .text(initials, LABEL_COL + 6, cardY + 6, { width: 40 });

      const detailX = LABEL_COL + 52;

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text(
          `Posição: ${snap.position ?? "N/D"}   |   Idade: ${snap.ageYears ?? "N/D"} anos   |   RTP: ${snap.rtpStatus ?? "N/D"}`,
          detailX,
          cardY + 6,
          { width: CARD_W - 60 },
        );

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#333333")
        .text(`ACWR: ${acwrText}`, detailX, cardY + 22, {
          width: CARD_W - 60,
        });

      doc.text(`Avaliação: ${scoresText}`, detailX, cardY + 36, {
        width: CARD_W - 60,
      });

      doc.y = cardY + CARD_H + CARD_GAP;
    });

    doc.moveDown(1);
    doc
      .fontSize(8)
      .fillColor("#666666")
      .text(
        "Documento gerado automaticamente pelo ClubOS ScoutLink. " +
          "Relatório informativo — dados anonimizados conforme LGPD Art. 12.",
        { align: "center" },
      );

    doc.end();
  });
}

/**
 * Orchestrates the full curation report pipeline for a single scout:
 *   1. Fetches scout profile (email, name, saved filters, subscription).
 *   2. Re-verifies subscription is still ACTIVE (guard against lapse between
 *      dispatch enqueue and worker execution).
 *   3. Queries top-20 matching athletes from public schema.
 *   4. Generates PDF buffer via PDFKit.
 *   5. Sends email with PDF attachment via Resend.
 *   6. Appends CURATION_REPORT_SENT to communication_log on success.
 *
 * Skip cases (return skipped: true, no throw):
 *   - Scout not found
 *   - Subscription lapsed between dispatch and execution
 *   - No matching athletes
 *
 * Email failure: logged but non-fatal — job completes (informational job).
 * PDF failure: re-thrown — triggers BullMQ retry with backoff.
 *
 * [SEC-JOB] communication_log metadata contains only { yearMonth, athleteCount } — no PII.
 */
export async function generateAndSendCurationReport(
  prisma: PrismaClient,
  scoutId: string,
  yearMonth: string,
): Promise<CurationReportResult> {
  const result: CurationReportResult = {
    scoutId,
    yearMonth,
    athleteCount: 0,
    emailSent: false,
    skipped: false,
  };

  const scout = await prisma.scoutProfile.findUnique({
    where: { id: scoutId },
    select: {
      email: true,
      name: true,
      targetPositions: true,
      subscriptionStatus: true,
      subscriptionExpiresAt: true,
    },
  });

  if (!scout) {
    result.skipped = true;
    result.skipReason = "scout not found";
    return result;
  }

  if (
    !isActiveSubscription(scout.subscriptionStatus, scout.subscriptionExpiresAt)
  ) {
    result.skipped = true;
    result.skipReason = "subscription lapsed";
    return result;
  }

  const scoutEmail = scout.email;
  if (!scoutEmail) {
    result.skipped = true;
    result.skipReason = "no email address";
    return result;
  }

  const athletes = await queryTopAthletes(prisma, {
    targetPositions: Array.isArray(scout.targetPositions)
      ? (scout.targetPositions as string[])
      : [],
  });

  if (athletes.length === 0) {
    result.skipped = true;
    result.skipReason = "no matching athletes";
    return result;
  }

  result.athleteCount = athletes.length;

  const pdfBuffer = await generateCurationPdf(
    athletes,
    scout.name ?? "Scout",
    yearMonth,
  );

  const resend = getResendClient();
  const humanPeriod = humanizeYearMonth(yearMonth);
  const capitalised =
    humanPeriod.charAt(0).toUpperCase() + humanPeriod.slice(1);

  const subject = `[ClubOS ScoutLink] Relatório de Curadoria — ${capitalised}`;
  const filename = `curadoria-scoutlink-${yearMonth}-${scoutId}.pdf`;

  const htmlBody = `
<div style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:auto;padding:24px">
  <h2 style="color:#1a5276">Relatório de Curadoria ScoutLink</h2>
  <p>Olá,</p>
  <p>O seu relatório mensal de curadoria referente a <strong>${capitalised}</strong>
     está disponível em anexo.</p>
  <p>O PDF contém os <strong>top ${athletes.length} atletas</strong> que correspondem
     aos seus filtros salvos, com dados de posição, idade, status RTP, ACWR e
     scores de avaliação.</p>
  <p style="font-size:12px;color:#666">
    Documento gerado automaticamente pelo ClubOS ScoutLink.<br>
    Dados anonimizados conforme LGPD Art. 12.
  </p>
</div>`.trim();

  const textBody =
    `Relatório de Curadoria ScoutLink — ${capitalised}\n\n` +
    `Seu relatório mensal com os top ${athletes.length} atletas está disponível em anexo (PDF).\n\n` +
    `Documento gerado automaticamente pelo ClubOS ScoutLink.\n` +
    `Dados anonimizados conforme LGPD Art. 12.`;

  const { error } = await resend.emails.send({
    from: getEmailFrom(),
    to: scoutEmail,
    subject,
    html: htmlBody,
    text: textBody,
    attachments: [{ filename, content: pdfBuffer }],
  });

  if (!error) {
    result.emailSent = true;
    await appendCommunicationLog(prisma, {
      actorId: "system:job:scout-curation",
      actorRole: "SYSTEM",
      targetId: scoutId,
      eventType: "CURATION_REPORT_SENT",
      // [SEC-JOB] no email, name, or filters in metadata
      metadata: { yearMonth, athleteCount: athletes.length },
    });
  }

  return result;
}
