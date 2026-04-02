import { z } from "zod";

const CURRENT_YEAR = new Date().getFullYear();
/** Oldest allowed athlete: 35 years old */
const MIN_BIRTH_YEAR = CURRENT_YEAR - 35;
/** Youngest allowed athlete: 5 years old */
const MAX_BIRTH_YEAR = CURRENT_YEAR - 5;

export const tryoutFormSchema = z
  .object({
    clubSlug: z.string().min(1),

    athleteName: z
      .string()
      .min(2, "Informe o nome completo")
      .max(120, "Nome deve ter no máximo 120 caracteres"),

    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)")
      .refine((d) => {
        const year = parseInt(d.split("-")[0]!, 10);
        return year >= MIN_BIRTH_YEAR && year <= MAX_BIRTH_YEAR;
      }, "Data de nascimento fora do intervalo permitido"),

    position: z.string().max(60).optional().or(z.literal("")),

    phone: z
      .string()
      .regex(
        /^\d{10,11}$/,
        "Telefone deve ter 10 ou 11 dígitos (apenas números)",
      ),

    email: z.email("Informe um e-mail válido").optional().or(z.literal("")),

    guardianName: z.string().max(120).optional().or(z.literal("")),

    guardianPhone: z
      .string()
      .regex(/^\d{10,11}$/, "Telefone do responsável deve ter 10 ou 11 dígitos")
      .optional()
      .or(z.literal("")),

    guardianRelationship: z
      .enum(["mae", "pai", "avo", "tio", "outro"])
      .optional(),

    notes: z.string().max(500).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const age = getAgeFromBirthDate(data.birthDate);
    if (age === null || age >= 18) return;

    if (!data.guardianName || data.guardianName.trim().length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["guardianName"],
        message: "Nome do responsável é obrigatório para menores de 18 anos",
      });
    }

    if (!data.guardianPhone || data.guardianPhone.trim().length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["guardianPhone"],
        message:
          "Telefone do responsável é obrigatório para menores de 18 anos",
      });
    }

    if (!data.guardianRelationship) {
      ctx.addIssue({
        code: "custom",
        path: ["guardianRelationship"],
        message: "Parentesco é obrigatório para menores de 18 anos",
      });
    }
  });

export type TryoutFormValues = z.infer<typeof tryoutFormSchema>;

/**
 * Calculates age in full years from an ISO date string ("YYYY-MM-DD").
 * Returns null if the string is unparseable.
 *
 * Accounts for whether the birthday has already occurred this calendar year.
 */
export function getAgeFromBirthDate(birthDate: string): number | null {
  try {
    const parts = birthDate.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return null;

    const birth = new Date(y, m - 1, d);
    if (isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();

    const hasBirthdayPassed =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() &&
        today.getDate() >= birth.getDate());

    if (!hasBirthdayPassed) age--;
    return age;
  } catch {
    return null;
  }
}
