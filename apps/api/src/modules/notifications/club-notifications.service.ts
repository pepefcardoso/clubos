import type { PrismaClient } from "../../../generated/prisma/index.js";
import { sendEmail } from "../../lib/email.js";
import { formatCurrency } from "../templates/templates.service.js";

export interface StaticPixFallbackCharge {
  chargeId: string;
  memberId: string;
  memberName: string;
  amountCents: number;
  dueDate: Date;
  /** The club's own Pix key that was used as last-resort fallback. */
  staticPixKey: string;
}

/**
 * Sends a summary email to all ADMIN users of a club when the static PIX
 * fallback was triggered for one or more charges in a generation run.
 *
 * Called once per `generateMonthlyCharges()` run — never once per charge —
 * to avoid spamming admins when many members trigger the fallback simultaneously.
 *
 * If no admin email is found, the function logs a warning and returns without
 * throwing — the charges are already persisted; notification failure must
 * never roll back a committed charge.
 *
 * If `sendEmail()` fails for one admin, the error is logged and the function
 * continues sending to remaining admins. All errors are collected and logged
 * together at the end, but none are re-thrown.
 *
 * This function reads from the **public schema** (`prisma.user`) and does NOT
 * use `withTenantSchema` — intentional, as the users table lives in public.
 *
 * @param prisma   Singleton Prisma client (public schema — reads `users` table).
 * @param clubId   Tenant identifier.
 * @param charges  List of charges that used the static PIX fallback.
 */
export async function notifyClubStaticPixFallback(
  prisma: PrismaClient,
  clubId: string,
  charges: StaticPixFallbackCharge[],
): Promise<void> {
  if (charges.length === 0) return;

  const admins = await prisma.user.findMany({
    where: { clubId, role: "ADMIN" },
    select: { email: true },
  });

  if (admins.length === 0) {
    console.warn(
      `No ADMIN users found for club "${clubId}" — static PIX fallback notification skipped.`,
    );
    return;
  }

  const pixKey = charges[0]!.staticPixKey;
  const subject = buildSubject(charges.length);
  const { html, text } = buildBody(charges, pixKey);

  const errors: string[] = [];
  for (const admin of admins) {
    try {
      await sendEmail({ to: admin.email, subject, html, text });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${admin.email}: ${reason}`);
    }
  }

  if (errors.length > 0) {
    console.error(
      `Failed to send static PIX fallback notification for club "${clubId}":`,
      errors.join("; "),
    );
  } else {
    console.info(
      `Static PIX fallback notification sent to ${admins.length} admin(s) ` +
        `for club "${clubId}" (${charges.length} charge(s) affected).`,
    );
  }
}

/**
 * Returns the email subject line for the static PIX fallback notification.
 * Uses singular phrasing when exactly one charge is affected.
 */
export function buildSubject(count: number): string {
  return count === 1
    ? "⚠️ ClubOS: cobrança processada via PIX estático (gateway indisponível)"
    : `⚠️ ClubOS: ${count} cobranças processadas via PIX estático (gateway indisponível)`;
}

/**
 * Builds both plaintext and minimal HTML versions of the admin notification body.
 *
 * The email is intentionally operational and concise — it lists affected
 * members and the static PIX key so the admin can follow up manually.
 *
 * HTML rendering:
 *   - Lines starting with "•" become `<li>` elements.
 *   - Empty lines become `<br>` spacers.
 *   - All other lines become `<p>` elements.
 *
 * @param charges  Charges that triggered the static PIX fallback.
 * @param pixKey   The club's static Pix key used as fallback.
 */
export function buildBody(
  charges: StaticPixFallbackCharge[],
  pixKey: string,
): { html: string; text: string } {
  const lines: string[] = [
    "Olá,",
    "",
    "O ClubOS não conseguiu processar as seguintes cobranças via gateway de pagamento.",
    `As cobranças foram registradas e a chave PIX estática do clube foi utilizada como alternativa: ${pixKey}`,
    "",
    "Cobranças afetadas:",
    ...charges.map(
      (c) =>
        `• ${c.memberName} — ${formatCurrency(c.amountCents)} (vencimento: ${c.dueDate.toLocaleDateString("pt-BR")})`,
    ),
    "",
    "Ação necessária:",
    "1. Compartilhe manualmente sua chave PIX com os sócios listados acima.",
    "2. Ao receber o pagamento, confirme-o pelo painel em Cobranças.",
    "3. Verifique a disponibilidade do seu gateway de pagamento e reconfigure se necessário.",
    "",
    "— ClubOS",
  ];

  const text = lines.join("\n");

  const htmlLines = lines.map((line) => {
    if (line.startsWith("•")) return `<li>${line.slice(2)}</li>`;
    if (line === "") return "<br>";
    return `<p style="margin:0 0 8px">${line}</p>`;
  });

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:auto;padding:24px">
${htmlLines.join("\n")}
</body></html>`;

  return { html, text };
}
