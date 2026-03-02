import { z } from "zod";
import { TEMPLATE_KEYS } from "./templates.constants.js";

/**
 * Variables available for interpolation inside every template body.
 *
 * All values are pre-formatted strings — callers must use formatCurrency()
 * and formatDate() before constructing this object.
 */
export interface TemplateVars {
  /** Member display name — plaintext, no decryption required. */
  nome: string;
  /** Formatted monetary amount, e.g. "R$ 99,00". Never a raw number. */
  valor: string;
  /** Pix copy-paste code string from Charge.gatewayMeta. */
  pix_link: string;
  /** Due date formatted as "DD/MM/YYYY" in America/Sao_Paulo timezone. */
  vencimento: string;
}

/**
 * Zod schema for the PUT /api/templates/:key request body.
 *
 * min(10): prevents saving an accidentally empty or trivially short body.
 * max(1000): keeps messages within WhatsApp's practical size limits.
 */
export const UpsertTemplateSchema = z.object({
  body: z
    .string()
    .min(10, "O corpo do template deve ter no mínimo 10 caracteres.")
    .max(1000, "O corpo do template deve ter no máximo 1000 caracteres."),
  channel: z.enum(["WHATSAPP", "EMAIL"]).default("WHATSAPP"),
});

export type UpsertTemplateInput = z.infer<typeof UpsertTemplateSchema>;

/**
 * Zod schema for validating the :key route parameter.
 * Rejects unknown keys early, before any DB call.
 */
export const TemplateKeyParamSchema = z.object({
  key: z.enum([
    TEMPLATE_KEYS.CHARGE_REMINDER_D3,
    TEMPLATE_KEYS.CHARGE_REMINDER_D0,
    TEMPLATE_KEYS.OVERDUE_NOTICE,
  ]),
});

/**
 * Shape returned by GET /api/templates for each template entry.
 */
export interface TemplateListItem {
  key: string;
  channel: "WHATSAPP" | "EMAIL";
  body: string;
  /** true when the club has a custom override saved in the DB; false = using default. */
  isCustom: boolean;
}
