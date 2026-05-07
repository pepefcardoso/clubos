import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { assertEventExists } from "../../../lib/assert-tenant-ownership.js";
import type { EventReportResponse, SectorReportRow } from "./reports.schema.js";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDatePt(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function buildResponse(
  event: {
    id: string;
    opponent: string;
    eventDate: Date;
    venue: string;
    status: string;
  },
  sectors: SectorReportRow[],
  totalPosSalesCents: number,
  integrityHash: string,
  generatedAt: Date,
): EventReportResponse {
  const totalTicketRevenueCents = sectors.reduce(
    (a, s) => a + s.revenueCents,
    0,
  );
  const totalCheckIns = sectors.reduce((a, s) => a + s.checkedIn, 0);
  const totalNoShows = sectors.reduce((a, s) => a + s.noShows, 0);
  const totalCapacity = sectors.reduce((a, s) => a + s.capacity, 0);
  const totalSold = sectors.reduce((a, s) => a + s.sold, 0);

  return {
    eventId: event.id,
    opponent: event.opponent,
    eventDate: event.eventDate.toISOString(),
    venue: event.venue,
    status: event.status,
    generatedAt: generatedAt.toISOString(),
    sectors,
    totalTicketRevenueCents,
    totalPosSalesCents,
    totalCombinedCents: totalTicketRevenueCents + totalPosSalesCents,
    totalCheckIns,
    totalNoShows,
    totalCapacity,
    totalSold,
    overallOccupancyPct:
      totalCapacity > 0
        ? Math.round((totalSold / totalCapacity) * 1000) / 10
        : 0,
    integrityHash,
  };
}

export async function getEventReport(
  prisma: PrismaClient,
  clubId: string,
  eventId: string,
  actorId: string,
): Promise<EventReportResponse> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    await assertEventExists(tx, eventId);

    const event = await tx.event.findUnique({
      where: { id: eventId },
      include: {
        sectors: {
          include: {
            tickets: {
              where: { status: "PAID" },
              select: { checkedIn: true },
            },
          },
        },
        posSales: { select: { amountCents: true } },
      },
    });

    const ev = event!;

    const sectors: SectorReportRow[] = ev.sectors.map((s) => {
      const paid = s.tickets.length;
      const ci = s.tickets.filter((t) => t.checkedIn).length;
      return {
        sectorId: s.id,
        name: s.name,
        capacity: s.capacity,
        sold: paid,
        checkedIn: ci,
        noShows: paid - ci,
        occupancyPct:
          s.capacity > 0 ? Math.round((paid / s.capacity) * 1000) / 10 : 0,
        revenueCents: paid * s.priceCents,
        priceCents: s.priceCents,
      };
    });

    const totalTicketRevenueCents = sectors.reduce(
      (a, s) => a + s.revenueCents,
      0,
    );
    const totalPosSalesCents = ev.posSales.reduce(
      (a, p) => a + p.amountCents,
      0,
    );

    const integrityHash = createHash("sha256")
      .update(
        [eventId, ev.eventDate.toISOString(), totalTicketRevenueCents].join(
          "|",
        ),
      )
      .digest("hex");

    const generatedAt = new Date();

    await tx.auditLog.create({
      data: {
        actorId,
        action: "EVENT_REPORT_GENERATED",
        entityId: eventId,
        entityType: "Event",
        metadata: {
          totalTicketRevenueCents,
          totalPosSalesCents,
          integrityHash,
        },
      },
    });

    return buildResponse(
      { ...ev, status: String(ev.status) },
      sectors,
      totalPosSalesCents,
      integrityHash,
      generatedAt,
    );
  });
}

export function generateEventReportPdf(
  data: EventReportResponse,
  clubName: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_WIDTH = 495;
    const HEADER_BG = "#1a5276";
    const generatedAt = new Date(data.generatedAt);
    const eventDate = new Date(data.eventDate);

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text("RELATÓRIO DE BILHETERIA — CLUBOS", { align: "center" });

    doc.fontSize(13).font("Helvetica").text(clubName, { align: "center" });

    doc
      .fontSize(10)
      .fillColor("#666666")
      .text(
        `${data.opponent} · ${data.venue} · ${formatDatePt(eventDate)}   |   Gerado em: ${formatDatePt(generatedAt)}`,
        { align: "center" },
      )
      .moveDown(1)
      .fillColor("#000000");

    const kpis = [
      {
        label: "RECEITA INGRESSOS",
        value: formatBRL(data.totalTicketRevenueCents),
      },
      { label: "RECEITA PDV", value: formatBRL(data.totalPosSalesCents) },
      { label: "RECEITA TOTAL", value: formatBRL(data.totalCombinedCents) },
      { label: "CHECK-INS", value: String(data.totalCheckIns) },
      { label: "NÃO-COMPARECERAM", value: String(data.totalNoShows) },
      { label: "OCUPAÇÃO GERAL", value: `${data.overallOccupancyPct}%` },
    ];

    const CARD_W = 77;
    const CARD_H = 50;
    const CARD_GAP = 6;
    const CARDS_PER_ROW = 3;
    const cardStartX = 50;
    const cardY = doc.y;

    kpis.forEach((k, idx) => {
      const row = Math.floor(idx / CARDS_PER_ROW);
      const col = idx % CARDS_PER_ROW;
      const x = cardStartX + col * (CARD_W + CARD_GAP);
      const y = cardY + row * (CARD_H + 8);

      doc.rect(x, y, CARD_W, CARD_H).fill("#eaf0f6").fillColor("#000000");
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#555555")
        .text(k.label, x + 4, y + 5, { width: CARD_W - 8 });
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#000000")
        .text(k.value, x + 4, y + 22, { width: CARD_W - 8 });
    });

    const rowsUsed = Math.ceil(kpis.length / CARDS_PER_ROW);
    doc.y = cardY + rowsUsed * (CARD_H + 8) + 14;
    doc.fillColor("#000000");

    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .text("BREAKDOWN POR SETOR")
      .moveDown(0.3);

    const COL = {
      name: { x: 50, w: 110 },
      cap: { x: 163, w: 55 },
      sold: { x: 221, w: 50 },
      ci: { x: 274, w: 55 },
      ns: { x: 332, w: 65 },
      occ: { x: 400, w: 45 },
      rev: { x: 448, w: 97 },
    };

    const ROW_H = 18;
    let y = doc.y;

    doc.rect(50, y - 3, PAGE_WIDTH, ROW_H).fill(HEADER_BG);
    doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");

    const headers: Array<[keyof typeof COL, string, "left" | "right"]> = [
      ["name", "Setor", "left"],
      ["cap", "Capacidade", "right"],
      ["sold", "Vendidos", "right"],
      ["ci", "Check-in", "right"],
      ["ns", "Não-comp.", "right"],
      ["occ", "Ocup.%", "right"],
      ["rev", "Receita (R$)", "right"],
    ];

    for (const [col, label, align] of headers) {
      doc.text(label, COL[col].x, y, { width: COL[col].w, align });
    }
    y += ROW_H;

    doc.fillColor("#000000").font("Helvetica").fontSize(8);

    if (data.sectors.length === 0) {
      doc.fillColor("#888888").text("Nenhum ingresso vendido.", 50, y + 6, {
        align: "center",
        width: PAGE_WIDTH,
      });
      y += 22;
    } else {
      data.sectors.forEach((s, i) => {
        if (y > 750) {
          doc.addPage();
          y = 50;
        }
        const bg = i % 2 === 0 ? "#eaf0f6" : "#ffffff";
        doc
          .rect(50, y - 2, PAGE_WIDTH, ROW_H - 2)
          .fill(bg)
          .fillColor("#000000");

        doc.text(s.name, COL.name.x, y, { width: COL.name.w });
        doc.text(String(s.capacity), COL.cap.x, y, {
          width: COL.cap.w,
          align: "right",
        });
        doc.text(String(s.sold), COL.sold.x, y, {
          width: COL.sold.w,
          align: "right",
        });
        doc.text(String(s.checkedIn), COL.ci.x, y, {
          width: COL.ci.w,
          align: "right",
        });
        doc.text(String(s.noShows), COL.ns.x, y, {
          width: COL.ns.w,
          align: "right",
        });
        doc.text(`${s.occupancyPct}%`, COL.occ.x, y, {
          width: COL.occ.w,
          align: "right",
        });
        doc.text(formatBRL(s.revenueCents), COL.rev.x, y, {
          width: COL.rev.w,
          align: "right",
        });

        y += ROW_H;
      });
    }

    doc.y = y + 12;

    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(
        `Receita PDV: ${formatBRL(data.totalPosSalesCents)}   |   ` +
          `Receita Combinada: ${formatBRL(data.totalCombinedCents)}`,
      )
      .moveDown(1.5);

    doc
      .fontSize(7)
      .fillColor("#666666")
      .text(
        `Integridade: ${data.integrityHash.slice(0, 16)}…   |   ` +
          "Documento gerado automaticamente pelo ClubOS. Não substitui relatório financeiro oficial.",
        { align: "center" },
      );

    doc.end();
  });
}
