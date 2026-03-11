import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import { sendEmail } from "../../lib/email.js";

export { formatDate } from "../../modules/templates/templates.service.js";

export interface ContractAlertResult {
  clubId: string;
  expiryD7Sent: number;
  expiryD1Sent: number;
  bidPendingSent: number;
  skipped: number;
  errors: Array<{ contractId: string; reason: string }>;
}

export type ContractAlertType =
  | "CONTRACT_EXPIRY_D7"
  | "CONTRACT_EXPIRY_D1"
  | "BID_PENDING";

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface ContractExpiryEmailVars {
  athleteName: string;
  contractType: string;
  endDate: string;
  daysRemaining: number;
  clubName: string;
}

interface BidPendingEmailVars {
  athleteName: string;
  contractType: string;
  startDate: string;
  clubName: string;
}

interface BidPendingBatchEmailVars {
  athletes: Array<{
    athleteName: string;
    contractType: string;
    startDate: string;
  }>;
  clubName: string;
}

/**
 * Wraps plain text in minimal HTML for Resend.
 * - `*text*` → `<strong>text</strong>`
 * - `\n` → `<br>`
 * HTML-special chars are escaped first to prevent injection.
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

/**
 * Formats a Date to "DD/MM/YYYY" in the America/Sao_Paulo timezone.
 */
export function formatContractDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Builds the email content for a single contract expiry alert (D-7 or D-1).
 */
export function buildExpiryEmailBody(
  vars: ContractExpiryEmailVars,
): EmailContent {
  const dayWord = vars.daysRemaining === 1 ? "dia" : "dias";
  const subject = `⚠️ Contrato vencendo em ${vars.daysRemaining} ${dayWord} — ${vars.athleteName}`;

  const text =
    `Atenção, administrador do ${vars.clubName}!\n\n` +
    `O contrato do atleta *${vars.athleteName}* (tipo: ${vars.contractType}) ` +
    `vence em *${vars.daysRemaining} ${dayWord}*, no dia ${vars.endDate}.\n\n` +
    `Acesse o ClubOS para renovar ou encerrar o vínculo antes do vencimento.\n\n` +
    `Este é um aviso automático do ClubOS.`;

  return { subject, text, html: renderedBodyToHtml(text) };
}

/**
 * Builds the email content for a BID-pending alert for a single contract.
 * Not used directly — see buildBidPendingBatchEmailBody for the preferred
 * batched variant that consolidates all pending athletes into one email.
 */
export function buildBidPendingEmailBody(
  vars: BidPendingEmailVars,
): EmailContent {
  const subject = `🚨 BID/CBF pendente — ${vars.athleteName} não pode ser escalado`;

  const text =
    `Atenção, administrador do ${vars.clubName}!\n\n` +
    `O atleta *${vars.athleteName}* possui contrato ATIVO ` +
    `(tipo: ${vars.contractType}, início: ${vars.startDate}) com *registro BID/CBF pendente*.\n\n` +
    `Este atleta *NÃO pode ser escalado* até que o BID seja confirmado.\n\n` +
    `Acesse o ClubOS, vá em Contratos e confirme o registro BID para regularizar a situação.\n\n` +
    `Este é um aviso automático do ClubOS.`;

  return { subject, text, html: renderedBodyToHtml(text) };
}

/**
 * Builds a single batched email listing ALL BID-pending athletes for a club.
 *
 * Batching avoids a daily email-per-contract flood for clubs with many
 * BID-pending records. The entire batch is treated as a single notification
 * unit for idempotency purposes (keyed on the synthetic contractId
 * "BID_PENDING_BATCH:{clubId}").
 */
export function buildBidPendingBatchEmailBody(
  vars: BidPendingBatchEmailVars,
): EmailContent {
  const subject = `🚨 ${vars.athletes.length} atleta(s) com BID/CBF pendente — ${vars.clubName}`;

  const athleteLines = vars.athletes
    .map(
      (a, i) =>
        `${i + 1}. *${a.athleteName}* — Contrato: ${a.contractType}, início: ${a.startDate}`,
    )
    .join("\n");

  const text =
    `Atenção, administrador do ${vars.clubName}!\n\n` +
    `Os seguintes atletas possuem contrato ATIVO com *registro BID/CBF pendente* ` +
    `e *NÃO podem ser escalados* até que o BID seja confirmado:\n\n` +
    `${athleteLines}\n\n` +
    `Acesse o ClubOS, vá em Contratos e confirme o registro BID para regularizar a situação.\n\n` +
    `Este é um aviso automático do ClubOS.`;

  return { subject, text, html: renderedBodyToHtml(text) };
}

/**
 * Returns true if an alert of the given type was already sent for this
 * contractId within the last `windowHours` hours.
 *
 * Queries `audit_log` using:
 *   - action = "CONTRACT_UPDATED" (reused action — see §1.5 Option A)
 *   - entityType = "ContractAlert" (distinguishes from human contract edits)
 *   - entityId = contractId
 *   - metadata.alertType = alertType (Prisma JSONB path filter)
 *   - createdAt >= now - windowHours
 *
 * @param tx          Prisma client inside a withTenantSchema transaction.
 * @param contractId  The contract to check.
 * @param alertType   Which alert type to look for.
 * @param windowHours Look-back window in hours (default: 20h).
 */
export async function hasRecentContractAlert(
  tx: PrismaClient,
  contractId: string,
  alertType: ContractAlertType,
  windowHours = 20,
): Promise<boolean> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  const found = await tx.auditLog.findFirst({
    where: {
      action: "CONTRACT_UPDATED",
      entityId: contractId,
      entityType: "ContractAlert",
      metadata: { path: ["alertType"], equals: alertType },
      createdAt: { gte: since },
    },
    select: { id: true },
  });

  return found !== null;
}

/**
 * Sends the same email to every admin recipient.
 * If ANY send fails, the error propagates to the caller.
 */
export async function sendEmailToAdmins(
  adminEmails: string[],
  content: EmailContent,
): Promise<void> {
  await Promise.all(
    adminEmails.map((to) =>
      sendEmail({
        to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
    ),
  );
}

/**
 * Records a contract alert in `audit_log` for idempotency and traceability.
 *
 * Uses `action = CONTRACT_UPDATED` with `entityType = "ContractAlert"` to
 * distinguish alert entries from actual contract mutations (Option A — no DDL
 * migration required).
 */
export async function logContractAlert(
  prisma: PrismaClient,
  clubId: string,
  contractId: string,
  alertType: ContractAlertType,
  actorId: string,
): Promise<void> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId,
        action: "CONTRACT_UPDATED",
        entityId: contractId,
        entityType: "ContractAlert",
        metadata: { alertType, sentAt: new Date().toISOString() },
      },
    });
  });
}

/**
 * Sends D-7 expiry alerts, D-1 expiry alerts, and BID-pending notices for all
 * eligible ACTIVE contracts in a single club.
 *
 * Recipient: club ADMIN users (fetched from the public `users` table).
 * Delivery: email via Resend (`lib/email.ts`).
 * Idempotency: `audit_log` check per contract per alertType within 20h.
 *
 * BID-pending alerts are batched into a *single email per club* listing all
 * affected athletes. This avoids email floods for clubs with many pending
 * registrations. The batch is keyed with the synthetic id
 * `BID_PENDING_BATCH:{clubId}` in audit_log.
 *
 * Error isolation: a send failure for one contract is captured in `errors[]`
 * and the loop continues. Only system-level failures (e.g. missing env vars
 * causing sendEmail to throw at the Resend init level) propagate upwards and
 * mark the BullMQ job as failed.
 *
 * @param prisma      Singleton Prisma client (not a transaction).
 * @param clubId      Tenant identifier.
 * @param d7DateStart UTC start of the D-7 target day (today + 7).
 * @param d7DateEnd   UTC end of the D-7 target day.
 * @param d1DateStart UTC start of the D-1 target day (today + 1).
 * @param d1DateEnd   UTC end of the D-1 target day.
 */
export async function sendContractAlertsForClub(
  prisma: PrismaClient,
  clubId: string,
  d7DateStart: Date,
  d7DateEnd: Date,
  d1DateStart: Date,
  d1DateEnd: Date,
): Promise<ContractAlertResult> {
  const result: ContractAlertResult = {
    clubId,
    expiryD7Sent: 0,
    expiryD1Sent: 0,
    bidPendingSent: 0,
    skipped: 0,
    errors: [],
  };

  const [adminUsers, club] = await Promise.all([
    prisma.user.findMany({
      where: { clubId, role: "ADMIN" },
      select: { email: true },
    }),
    prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true },
    }),
  ]);

  if (adminUsers.length === 0 || !club) {
    return result;
  }

  const adminEmails = adminUsers.map((u) => u.email);
  const clubName = club.name;

  const { expiringD7, expiringD1, bidPending } = await withTenantSchema(
    prisma,
    clubId,
    async (tx) => {
      const [expiringD7, expiringD1, bidPending] = await Promise.all([
        tx.contract.findMany({
          where: {
            status: "ACTIVE",
            endDate: { gte: d7DateStart, lte: d7DateEnd },
          },
          include: { athlete: { select: { name: true } } },
        }),
        tx.contract.findMany({
          where: {
            status: "ACTIVE",
            endDate: { gte: d1DateStart, lte: d1DateEnd },
          },
          include: { athlete: { select: { name: true } } },
        }),
        tx.contract.findMany({
          where: { status: "ACTIVE", bidRegistered: false },
          include: { athlete: { select: { name: true } } },
        }),
      ]);
      return { expiringD7, expiringD1, bidPending };
    },
  );

  for (const contract of expiringD7) {
    const alreadySent = await withTenantSchema(prisma, clubId, (tx) =>
      hasRecentContractAlert(tx, contract.id, "CONTRACT_EXPIRY_D7", 20),
    );
    if (alreadySent) {
      result.skipped++;
      continue;
    }

    try {
      const content = buildExpiryEmailBody({
        athleteName: contract.athlete.name,
        contractType: contract.type,
        endDate: formatContractDate(contract.endDate!),
        daysRemaining: 7,
        clubName,
      });
      await sendEmailToAdmins(adminEmails, content);
      await logContractAlert(
        prisma,
        clubId,
        contract.id,
        "CONTRACT_EXPIRY_D7",
        "system:job:contract-alerts",
      );
      result.expiryD7Sent++;
    } catch (err) {
      result.errors.push({
        contractId: contract.id,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  for (const contract of expiringD1) {
    const alreadySent = await withTenantSchema(prisma, clubId, (tx) =>
      hasRecentContractAlert(tx, contract.id, "CONTRACT_EXPIRY_D1", 20),
    );
    if (alreadySent) {
      result.skipped++;
      continue;
    }

    try {
      const content = buildExpiryEmailBody({
        athleteName: contract.athlete.name,
        contractType: contract.type,
        endDate: formatContractDate(contract.endDate!),
        daysRemaining: 1,
        clubName,
      });
      await sendEmailToAdmins(adminEmails, content);
      await logContractAlert(
        prisma,
        clubId,
        contract.id,
        "CONTRACT_EXPIRY_D1",
        "system:job:contract-alerts",
      );
      result.expiryD1Sent++;
    } catch (err) {
      result.errors.push({
        contractId: contract.id,
        reason: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (bidPending.length > 0) {
    const batchContractId = `BID_PENDING_BATCH:${clubId}`;

    const alreadySent = await withTenantSchema(prisma, clubId, (tx) =>
      hasRecentContractAlert(tx, batchContractId, "BID_PENDING", 20),
    );

    if (alreadySent) {
      result.skipped += bidPending.length;
    } else {
      try {
        const content = buildBidPendingBatchEmailBody({
          athletes: bidPending.map((c) => ({
            athleteName: c.athlete.name,
            contractType: c.type,
            startDate: formatContractDate(c.startDate),
          })),
          clubName,
        });
        await sendEmailToAdmins(adminEmails, content);
        await logContractAlert(
          prisma,
          clubId,
          batchContractId,
          "BID_PENDING",
          "system:job:contract-alerts",
        );
        result.bidPendingSent++;
      } catch (err) {
        result.errors.push({
          contractId: batchContractId,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }

  return result;
}
