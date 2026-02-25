import { z } from "zod";

export const clubDataSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(120, "Nome pode ter no máximo 120 caracteres"),
  slug: z
    .string()
    .min(3, "Slug deve ter pelo menos 3 caracteres")
    .max(50, "Slug pode ter no máximo 50 caracteres")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug deve ser minúsculo, alfanumérico, separado por hífens (ex: "meu-clube")',
    ),
  cnpj: z
    .string()
    .regex(/^\d{14}$/, "CNPJ deve conter exatamente 14 dígitos (sem máscara)")
    .optional()
    .or(z.literal("")),
});

export const logoSchema = z.object({
  logoFile: z.instanceof(File).optional(),
});

export type ClubDataValues = z.infer<typeof clubDataSchema>;
export type LogoValues = z.infer<typeof logoSchema>;

export type Step = 1 | 2 | 3;

export interface WizardState {
  clubData: ClubDataValues | null;
  logoFile: File | null;
  logoPreviewUrl: string | null;
}

/**
 * Derives a URL-safe slug from a human-readable club name.
 * Strips accents, lowercases, replaces spaces and special chars with hyphens.
 */
export function generateSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatCnpjDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function stripCnpjMask(masked: string): string {
  return masked.replace(/\D/g, "");
}
