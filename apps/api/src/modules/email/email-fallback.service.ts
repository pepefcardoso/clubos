import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { sendEmail } from "../../lib/email.js";
import { buildRenderedMessage } from "../templates/templates.service.js";
import type { TemplateKey } from "../templates/templates.constants.js";
import type { GatewayMeta } from "../charges/charges.schema.js";

export interface EmailFallbackInput {
  clubId: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  template: TemplateKey;
  charge: {
    amountCents: number;
    dueDate: Date;
    gatewayMeta: GatewayMeta | null | undefined;
  };
}

export interface EmailFallbackResult {
  messageId: string;
  status: "SENT" | "FAILED";
  failReason?: string | undefined;
}

/**
 * Sends a billing email fallback for a single member and persists the result.
 *
 * Called when a WhatsApp send has failed at least twice within 48 hours for the
 * same (memberId, template) pair. This function is the final escalation path
 * before the charge is silently left unnotified.
 *
 * Execution steps:
 *   1. Render the email body via buildRenderedMessage (channel = 'EMAIL').
 *   2. Create a Message row with status PENDING inside the tenant schema.
 *   3. Call sendEmail() via Resend.
 *   4. Update Message to SENT or FAILED.
 *   5. Create AuditLog entry (action = MESSAGE_SENT, metadata.fallback = true).
 *
 * Error handling:
 *   - sendEmail() failures are caught, stored as FAILED, and returned — no re-throw.
 *   - buildRenderedMessage() failures propagate to the caller (template
 *     misconfiguration — caller should record in errors[] and skip).
 *
 * @param prisma    Singleton Prisma client (not a transaction).
 * @param input     Fallback parameters including member email and charge data.
 * @param actorId   Actor written to AuditLog.
 */
export async function sendEmailFallbackMessage(
  prisma: PrismaClient,
  input: EmailFallbackInput,
  actorId = "system:job:email-fallback",
): Promise<EmailFallbackResult> {
  const renderedBody = await buildRenderedMessage(
    prisma,
    input.clubId,
    input.template,
    input.charge,
    input.memberName,
    "EMAIL",
  );

  return withTenantSchema(prisma, input.clubId, async (tx) => {
    const message = await tx.message.create({
      data: {
        memberId: input.memberId,
        channel: "EMAIL",
        template: input.template,
        status: "PENDING",
      },
    });

    let status: "SENT" | "FAILED" = "FAILED";
    let failReason: string | undefined;

    try {
      await sendEmail({
        to: input.memberEmail,
        subject: buildEmailSubject(input.template),
        html: renderedBodyToHtml(renderedBody),
        text: renderedBody,
      });
      status = "SENT";
    } catch (err) {
      status = "FAILED";
      failReason = err instanceof Error ? err.message : "Unknown email error";
    }

    await tx.message.update({
      where: { id: message.id },
      data: {
        status,
        ...(status === "SENT" ? { sentAt: new Date() } : {}),
        ...(failReason !== undefined ? { failReason } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        memberId: input.memberId,
        actorId,
        action: "MESSAGE_SENT",
        entityId: message.id,
        entityType: "Message",
        metadata: {
          channel: "EMAIL",
          template: input.template,
          status,
          fallback: true,
          failReason: failReason ?? null,
        },
      },
    });

    return { messageId: message.id, status, failReason };
  });
}

/**
 * Maps template keys to human-readable Portuguese email subjects.
 */
export function buildEmailSubject(template: TemplateKey): string {
  const subjects: Record<TemplateKey, string> = {
    charge_reminder_d3: "Lembrete: sua mensalidade vence em 3 dias",
    charge_reminder_d0: "Atenção: sua mensalidade vence hoje",
    overdue_notice: "Aviso de inadimplência — regularize sua situação",
  };
  return subjects[template] ?? "Mensagem do seu clube";
}

/**
 * Wraps plain text in minimal HTML for Resend.
 *
 * Transforms:
 *   - `*text*` → `<strong>text</strong>` (WhatsApp bold syntax)
 *   - `\n` → `<br>` (line breaks)
 *   - HTML special chars are escaped first to prevent injection.
 */
export function renderedBodyToHtml(plainText: string): string {
  const escaped = plainText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withBold = escaped.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  const withLineBreaks = withBold.replace(/\n/g, "<br>");

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;line-height:1.6;max-width:600px;margin:auto;padding:24px">${withLineBreaks}</body></html>`;
}
