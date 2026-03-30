import { z } from "zod";

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024;

export const UploadBalanceSheetSchema = z.object({
  title: z
    .string()
    .min(2, "Título deve ter pelo menos 2 caracteres")
    .max(200, "Título deve ter no máximo 200 caracteres"),
  period: z
    .string()
    .min(2, "Período deve ter pelo menos 2 caracteres")
    .max(100, "Período deve ter no máximo 100 caracteres"),
});

export type UploadBalanceSheetInput = z.infer<typeof UploadBalanceSheetSchema>;

export interface BalanceSheetResponse {
  id: string;
  title: string;
  /** Human-readable label, e.g. "2024", "1º Trimestre 2025" */
  period: string;
  /** Publicly accessible URL to the stored PDF file */
  fileUrl: string;
  /** SHA-256 hex digest of the original PDF bytes */
  fileHash: string;
  /** ISO 8601 string */
  publishedAt: string;
}

export interface BalanceSheetsListResponse {
  data: BalanceSheetResponse[];
  total: number;
}
