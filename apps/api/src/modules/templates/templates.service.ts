import type { PrismaClient } from "../../../generated/prisma/index.js";
import { withTenantSchema } from "../../lib/prisma.js";
import {
  TEMPLATE_KEYS,
  DEFAULT_TEMPLATES,
  type TemplateKey,
} from "./templates.constants.js";
import type { TemplateVars, TemplateListItem } from "./templates.schema.js";
import type { GatewayMeta, PixGatewayMeta } from "../charges/charges.schema.js";

const CONFIGURABLE_TEMPLATE_KEYS = [
  TEMPLATE_KEYS.CHARGE_REMINDER_D3,
  TEMPLATE_KEYS.CHARGE_REMINDER_D0,
  TEMPLATE_KEYS.OVERDUE_NOTICE,
] as const;

/**
 * Formats an integer cent value to a Brazilian Real currency string.
 *
 * @example formatCurrency(9900)   → "R$ 99,00"
 * @example formatCurrency(149900) → "R$ 1.499,00"
 * @example formatCurrency(0)      → "R$ 0,00"
 */
export function formatCurrency(amountCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amountCents / 100);
}

/**
 * Formats a Date to "DD/MM/YYYY" in the America/Sao_Paulo timezone.
 * All clubs are Brazil-based, so this timezone is always correct.
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Substitutes all known placeholders in a template body with their runtime values.
 *
 * Known placeholders: {nome}, {valor}, {pix_link}, {vencimento}.
 * Any other `{...}` sequences are left untouched — this is intentional and
 * allows clubs to include literal braces in their custom template text.
 *
 * Uses global regex replace so multiple occurrences of the same variable
 * (e.g. two `{nome}` in one template) are all replaced correctly.
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body
    .replace(/\{nome\}/g, vars.nome)
    .replace(/\{valor\}/g, vars.valor)
    .replace(/\{pix_link\}/g, vars.pix_link)
    .replace(/\{vencimento\}/g, vars.vencimento);
}

/**
 * Returns the active template body for a given key and channel.
 *
 * Resolution order:
 *   1. Custom template in the tenant's `message_templates` table (if isActive = true)
 *   2. Hard-coded DEFAULT_TEMPLATES constant (fallback)
 *
 * @param prisma   Singleton Prisma client.
 * @param clubId   Tenant identifier.
 * @param key      One of the TEMPLATE_KEYS values.
 * @param channel  'WHATSAPP' (default) or 'EMAIL'.
 */
export async function getTemplate(
  prisma: PrismaClient,
  clubId: string,
  key: TemplateKey,
  channel: "WHATSAPP" | "EMAIL" = "WHATSAPP",
): Promise<string> {
  const custom = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.messageTemplate.findUnique({
      where: { key_channel: { key, channel } },
      select: { body: true, isActive: true },
    });
  });

  if (custom?.isActive === true) {
    return custom.body;
  }

  return DEFAULT_TEMPLATES[key];
}

/**
 * Lists all three template keys for a club, indicating which have active
 * custom overrides vs. the default.
 *
 * Used by GET /api/templates to give the admin full visibility.
 */
export async function listTemplates(
  prisma: PrismaClient,
  clubId: string,
  channel: "WHATSAPP" | "EMAIL" = "WHATSAPP",
): Promise<TemplateListItem[]> {
  const customRows = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.messageTemplate.findMany({
      where: { channel },
      select: { key: true, body: true, isActive: true },
    });
  });

  const customMap = new Map(customRows.map((r) => [r.key, r]));

  return CONFIGURABLE_TEMPLATE_KEYS.map((key) => {
    const custom = customMap.get(key);
    const isCustom = custom?.isActive === true;
    return {
      key,
      channel,
      body: isCustom ? custom!.body : DEFAULT_TEMPLATES[key],
      isCustom,
    };
  });
}

/**
 * Creates or updates a custom template for a club.
 *
 * Uses an upsert pattern: if a row exists for (key, channel), it is updated;
 * otherwise a new row is inserted. Always sets isActive = true.
 *
 * The actorId is written to AuditLog for traceability.
 */
export async function upsertTemplate(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  key: TemplateKey,
  body: string,
  channel: "WHATSAPP" | "EMAIL" = "WHATSAPP",
): Promise<void> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.messageTemplate.upsert({
      where: { key_channel: { key, channel } },
      create: {
        key,
        channel,
        body,
        isActive: true,
      },
      update: {
        body,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_UPDATED", // closest existing AuditAction; no TEMPLATE_UPDATED yet
        entityType: "MessageTemplate",
        metadata: { key, channel, action: "upsert" },
      },
    });
  });
}

/**
 * Resets a club's custom template back to the default by deleting the custom row.
 *
 * After this call, getTemplate() will return DEFAULT_TEMPLATES[key] for the club.
 * Safe to call when no custom row exists — the delete is a no-op in that case.
 */
export async function resetTemplate(
  prisma: PrismaClient,
  clubId: string,
  actorId: string,
  key: TemplateKey,
  channel: "WHATSAPP" | "EMAIL" = "WHATSAPP",
): Promise<void> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.messageTemplate.deleteMany({
      where: { key, channel },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "PLAN_UPDATED",
        entityType: "MessageTemplate",
        metadata: { key, channel, action: "reset" },
      },
    });
  });
}

/**
 * Fetches the appropriate template, formats the charge variables, and returns
 * the fully interpolated message body ready to pass to sendWhatsAppMessage().
 *
 * This is the primary entry point for the D-3 and D+3 job workers.
 *
 * @param prisma       Singleton Prisma client.
 * @param clubId       Tenant identifier.
 * @param key          Which template to use (D-3, D-0, or D+3).
 * @param charge       Charge data — amountCents, dueDate, gatewayMeta.
 * @param memberName   Plaintext member name (no decryption needed).
 * @param channel      'WHATSAPP' (default) or 'EMAIL'.
 */
export async function buildRenderedMessage(
  prisma: PrismaClient,
  clubId: string,
  key: TemplateKey,
  charge: {
    amountCents: number;
    dueDate: Date;
    gatewayMeta: GatewayMeta | null | undefined;
  },
  memberName: string,
  channel: "WHATSAPP" | "EMAIL" = "WHATSAPP",
): Promise<string> {
  const body = await getTemplate(prisma, clubId, key, channel);

  const gatewayMeta = charge.gatewayMeta;
  const pixCopyPaste =
    gatewayMeta !== null &&
    gatewayMeta !== undefined &&
    "pixCopyPaste" in gatewayMeta
      ? (gatewayMeta as PixGatewayMeta).pixCopyPaste
      : "(código Pix indisponível)";

  const vars: TemplateVars = {
    nome: memberName,
    valor: formatCurrency(charge.amountCents),
    pix_link: pixCopyPaste,
    vencimento: formatDate(charge.dueDate),
  };

  return renderTemplate(body, vars);
}
