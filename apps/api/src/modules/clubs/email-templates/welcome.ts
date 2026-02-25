export interface WelcomeEmailContext {
  clubName: string;
  adminEmail: string;
  dashboardUrl: string;
}

export function buildWelcomeEmail(ctx: WelcomeEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Bem-vindo ao ClubOS, ${ctx.clubName}!`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="font-family: Inter, system-ui, sans-serif; background: #f4f3ef; margin: 0; padding: 32px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto;">
    <tr>
      <td style="background: #ffffff; border-radius: 8px; padding: 40px 36px; border: 1px solid #e8e6e0;">
        <!-- Logo / wordmark -->
        <p style="margin: 0 0 32px; font-size: 1.25rem; font-weight: 700; color: #2d7d2d; letter-spacing: -0.02em;">
          ClubOS
        </p>
        <!-- Heading -->
        <h1 style="margin: 0 0 16px; font-size: 1.375rem; font-weight: 700; color: #171410; line-height: 1.3;">
          Seja bem-vindo, ${ctx.clubName}! 🎉
        </h1>
        <!-- Body -->
        <p style="margin: 0 0 16px; font-size: 0.9375rem; color: #57534a; line-height: 1.6;">
          Seu clube foi criado com sucesso no ClubOS. Agora você pode cadastrar seus sócios,
          configurar planos e começar a gerar cobranças via Pix — tudo em um só lugar.
        </p>
        <p style="margin: 0 0 28px; font-size: 0.9375rem; color: #57534a; line-height: 1.6;">
          Acesse o painel para dar os primeiros passos:
        </p>
        <!-- CTA button -->
        <a href="${ctx.dashboardUrl}"
           style="display: inline-block; background: #2d7d2d; color: #ffffff; font-size: 0.9375rem;
                  font-weight: 600; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          Acessar o painel
        </a>
        <!-- Divider -->
        <hr style="margin: 36px 0; border: none; border-top: 1px solid #e8e6e0;" />
        <!-- Footer -->
        <p style="margin: 0; font-size: 0.8125rem; color: #a8a49a; line-height: 1.5;">
          Este e-mail foi enviado para <strong>${ctx.adminEmail}</strong> porque você criou
          uma conta no ClubOS. Se não foi você, ignore esta mensagem.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `
Seja bem-vindo ao ClubOS, ${ctx.clubName}!

Seu clube foi criado com sucesso. Acesse o painel para configurar seus sócios e planos:
${ctx.dashboardUrl}

---
Este e-mail foi enviado para ${ctx.adminEmail}.
Se não foi você quem criou a conta, ignore esta mensagem.
`.trim();

  return { subject, html, text };
}
