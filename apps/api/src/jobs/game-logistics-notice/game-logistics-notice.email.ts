interface AthleteRow {
  name: string;
  position: string | null;
}

interface EventRow {
  opponent: string;
  eventDate: Date;
  venue: string;
}

interface GameLogisticsEmailInput {
  clubName: string;
  event: EventRow;
  athletes: AthleteRow[];
}

interface GameLogisticsEmailOutput {
  subject: string;
  html: string;
  text: string;
}

const ptBR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export function buildGameLogisticsEmail(
  input: GameLogisticsEmailInput,
): GameLogisticsEmailOutput {
  const { clubName, event, athletes } = input;
  const formattedDate = ptBR.format(event.eventDate);

  const athleteLines = athletes.map((a) =>
    a.position ? `  • ${a.name} (${a.position})` : `  • ${a.name}`,
  );
  const athleteText =
    athleteLines.length > 0
      ? athleteLines.join("\n")
      : "  (nenhum atleta ativo cadastrado)";

  const athleteHtml =
    athletes.length > 0
      ? athletes
          .map(
            (a) =>
              `<li style="margin:4px 0">${a.name}${a.position ? ` <span style="color:#6b7280">(${a.position})</span>` : ""}</li>`,
          )
          .join("")
      : `<li style="color:#6b7280">Nenhum atleta ativo cadastrado</li>`;

  const subject = `[ClubOS] Aviso de logística — ${clubName} x ${event.opponent} em 48h`;

  const text = [
    `Olá,`,
    ``,
    `Este é um aviso automático do ClubOS: o jogo abaixo ocorre em aproximadamente 48 horas.`,
    ``,
    `Jogo:    ${clubName} x ${event.opponent}`,
    `Data:    ${formattedDate}`,
    `Local:   ${event.venue}`,
    ``,
    `Atletas ativos (${athletes.length}):`,
    athleteText,
    ``,
    `Acesse o painel do ClubOS para confirmar a lista de convocados e revisar o checklist de logística.`,
    ``,
    `— ClubOS`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden">
        <tr>
          <td style="background:#1d4ed8;padding:24px 32px">
            <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700">ClubOS</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Aviso de Logística de Jogo</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Este jogo ocorre em aproximadamente <strong>48 horas</strong>.</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px;padding:16px;margin-bottom:24px">
              <tr><td style="padding:4px 0;font-size:14px;color:#374151"><strong>Jogo:</strong> ${clubName} x ${event.opponent}</td></tr>
              <tr><td style="padding:4px 0;font-size:14px;color:#374151"><strong>Data:</strong> ${formattedDate}</td></tr>
              <tr><td style="padding:4px 0;font-size:14px;color:#374151"><strong>Local:</strong> ${event.venue}</td></tr>
            </table>

            <h3 style="margin:0 0 12px;font-size:15px;color:#111827">Atletas ativos (${athletes.length})</h3>
            <ul style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:14px">
              ${athleteHtml}
            </ul>

            <p style="margin:0;font-size:13px;color:#6b7280">
              Acesse o painel do ClubOS para confirmar a lista de convocados e revisar o checklist de logística.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">ClubOS — mensagem automática, não responda este e-mail.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  return { subject, html, text };
}
