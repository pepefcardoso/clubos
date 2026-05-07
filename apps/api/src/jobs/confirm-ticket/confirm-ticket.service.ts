import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { generateQrToken } from "../../lib/qr-token.js";
import { sendEmail } from "../../lib/email.js";
import type {
  ConfirmTicketJobData,
  ConfirmTicketResult,
} from "./confirm-ticket.types.js";

/**
 * Confirms a ticket after payment and sends a QR code via email.
 *
 * Idempotency: if the ticket is already PAID the function returns
 * { skipped: true } without re-sending the email. The QR token is
 * deterministic so re-sending (e.g. manual retry) produces the same token.
 *
 * No WhatsApp: fan phone is stored as plain text in fan_profiles and the
 * existing sendWhatsAppMessage helper only works with encrypted Bytes columns.
 * Email via Resend is the correct delivery channel for fans.
 */
export async function confirmTicketAndNotify(
  prisma: PrismaClient,
  data: ConfirmTicketJobData,
): Promise<ConfirmTicketResult> {
  const { ticketId, clubId } = data;

  const ticket = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        eventId: true,
        fanEmail: true,
        fanName: true,
        status: true,
        sector: {
          select: { name: true },
        },
        event: {
          select: {
            opponent: true,
            eventDate: true,
            venue: true,
            sponsorName: true,
            sponsorLogoUrl: true,
            sponsorCtaUrl: true,
          },
        },
      },
    });
  });

  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found in club ${clubId}`);
  }

  if (String(ticket.status) === "PAID") {
    return { skipped: true, reason: "already_confirmed" };
  }

  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: "PAID", updatedAt: new Date() },
    });
  });

  const qrToken = generateQrToken(ticketId, ticket.eventId);

  const qrPayload = JSON.stringify({
    ticketId,
    eventId: ticket.eventId,
    clubId,
    t: qrToken,
  });
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrPayload)}`;

  const eventDateFormatted = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(ticket.event.eventDate);

  await sendEmail({
    to: ticket.fanEmail,
    subject: "Seu ingresso está confirmado! 🎉",
    html: buildConfirmationHtml({
      fanName: ticket.fanName,
      opponent: ticket.event.opponent,
      eventDate: eventDateFormatted,
      venue: ticket.event.venue,
      sectorName: ticket.sector.name,
      qrImageUrl,
      qrToken,
      sponsorName: ticket.event.sponsorName,
      sponsorLogoUrl: ticket.event.sponsorLogoUrl,
      sponsorCtaUrl: ticket.event.sponsorCtaUrl,
    }),
    text: buildConfirmationText({
      fanName: ticket.fanName,
      opponent: ticket.event.opponent,
      eventDate: eventDateFormatted,
      venue: ticket.event.venue,
      sectorName: ticket.sector.name,
      qrToken,
      sponsorName: ticket.event.sponsorName,
    }),
  });

  return { skipped: false, sent: true, ticketId, qrToken };
}

interface EmailParams {
  fanName: string;
  opponent: string;
  eventDate: string;
  venue: string;
  sectorName: string;
  qrImageUrl: string;
  qrToken: string;
  sponsorName?: string | null;
  sponsorLogoUrl?: string | null;
  sponsorCtaUrl?: string | null;
}

function buildConfirmationHtml(p: EmailParams): string {
  const sponsorBlock = p.sponsorName
    ? `
  <tr>
    <td colspan="2" style="padding:16px 8px 8px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="font-size:11px;color:#6b7280;margin:0 0 8px">Realização</p>
      ${
        p.sponsorLogoUrl
          ? `<a href="${p.sponsorCtaUrl ?? "#"}" style="display:inline-block">
               <img src="${p.sponsorLogoUrl}" alt="${p.sponsorName}" height="40"
                    style="max-width:200px;height:40px;object-fit:contain" />
             </a>`
          : `<span style="font-weight:600">${p.sponsorName}</span>`
      }
    </td>
  </tr>`
    : "";

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Ingresso Confirmado</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h1 style="color:#16a34a">Ingresso Confirmado! 🎉</h1>
  <p>Olá, <strong>${p.fanName}</strong>!</p>
  <p>Seu pagamento foi confirmado. Apresente o QR Code abaixo na entrada.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Jogo</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${p.opponent}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Data</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${p.eventDate}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Local</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${p.venue}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Setor</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${p.sectorName}</td></tr>
    ${sponsorBlock}
  </table>
  <img src="${p.qrImageUrl}" alt="QR Code do Ingresso" width="250" height="250" style="display:block;margin:24px auto" />
  <p style="font-size:12px;color:#6b7280;text-align:center;word-break:break-all">${p.qrToken}</p>
</body>
</html>`;
}

interface TextParams {
  fanName: string;
  opponent: string;
  eventDate: string;
  venue: string;
  sectorName: string;
  qrToken: string;
  sponsorName?: string | null;
}

function buildConfirmationText(p: TextParams): string {
  const lines = [
    `Ingresso Confirmado!`,
    ``,
    `Olá, ${p.fanName}!`,
    ``,
    `Jogo: ${p.opponent}`,
    `Data: ${p.eventDate}`,
    `Local: ${p.venue}`,
    `Setor: ${p.sectorName}`,
    ``,
    `Código QR: ${p.qrToken}`,
    ``,
    `Apresente este código na entrada do evento.`,
  ];
  if (p.sponsorName) lines.push(``, `Patrocinador: ${p.sponsorName}`);
  return lines.join("\n");
}
