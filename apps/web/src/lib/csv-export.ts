/**
 * Client-side CSV Generation & Download Utility
 *
 * Mirrors the server-side csv-sanitize.ts pattern for formula-injection protection.
 * Used by the reconciliation module to export match results without a round-trip to the API.
 *
 * UTF-8 BOM is prepended to ensure Excel on Brazilian locale renders
 * special characters (R$, ã, ç, etc.) correctly without garbling.
 */

/**
 * Characters that trigger formula evaluation when they appear at the
 * start of a cell value in Excel, LibreOffice, and Google Sheets.
 */
const INJECTION_TRIGGER_CHARS = new Set([
  "=",
  "+",
  "-",
  "@",
  "\t",
  "\r",
  "|",
  "%",
]);

/**
 * Returns true if the value begins with a CSV formula injection character.
 */
function hasCsvInjection(value: string): boolean {
  if (!value || value.length === 0) return false;
  return INJECTION_TRIGGER_CHARS.has(value[0]!);
}

/**
 * Sanitises a string for safe inclusion in a CSV export by prepending a
 * single-quote (`'`) when the value starts with an injection trigger character.
 *
 * The leading apostrophe is the standard spreadsheet convention for forcing
 * a cell to be treated as plain text.
 */
function sanitizeCsvField(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (hasCsvInjection(s)) return `'${s}`;
  return s;
}

export interface CsvHeader {
  key: string;
  label: string;
}

export type CsvRow = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Converts an array of row objects to a RFC 4180-compliant CSV string.
 *
 * - First row: column headers from `headers[].label`.
 * - All values are double-quoted; internal double-quotes are escaped as `""`.
 * - Free-text string fields are CSV-injection-sanitised.
 * - Rows are separated by `\r\n` (Windows line endings required by the CSV spec).
 */
export function toCsv(rows: CsvRow[], headers: CsvHeader[]): string {
  const headerRow = headers.map((h) => `"${h.label}"`).join(",");

  const dataRows = rows.map((row) =>
    headers
      .map(({ key }) => {
        const raw = row[key];
        if (raw == null) return '""';
        const sanitised = sanitizeCsvField(String(raw));
        return `"${sanitised.replace(/"/g, '""')}"`;
      })
      .join(","),
  );

  return [headerRow, ...dataRows].join("\r\n");
}

/**
 * Triggers a browser file download for a CSV string.
 *
 * Prepends a UTF-8 BOM (`\uFEFF`) so Excel on Brazilian locale (pt-BR)
 * correctly renders accented characters and the R$ symbol without garbling.
 *
 * @param csv      - CSV string produced by `toCsv()`
 * @param filename - Suggested filename (e.g. `"conciliacao-2025-01-15.csv"`)
 */
export function downloadCsv(csv: string, filename: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
