/**
 * CSV Injection Protection Utility
 *
 * CSV Injection (also called Formula Injection) occurs when user-supplied data
 * beginning with a formula trigger character is interpreted as a spreadsheet
 * formula by Excel, LibreOffice, or Google Sheets when a CSV is opened.
 *
 * References:
 *   - OWASP CSV Injection: https://owasp.org/www-community/attacks/CSV_Injection
 *
 * EXPORT USAGE PATTERN
 *
 * When building any CSV export endpoint, every user-generated string field
 * MUST be passed through sanitizeCsvField() before being written to the
 * response stream. Example:
 *
 *   const row = [
 *     sanitizeCsvField(member.name),
 *     sanitizeCsvField(member.email ?? ''),
 *     member.cpf,   // digits only, safe without sanitisation
 *   ].join(',');
 *
 * Do NOT sanitise numeric/digit-only fields (cpf, phone, amountCents) —
 * sanitizeCsvField is designed for free-text fields only.
 */

/**
 * Characters that trigger formula evaluation when they appear at the
 * start of a cell value in Excel, LibreOffice, and Google Sheets.
 *
 * | Char | Why dangerous                              |
 * |------|--------------------------------------------|
 * | =    | Formula prefix (all spreadsheet apps)      |
 * | +    | Formula prefix (Excel)                     |
 * | -    | Formula prefix (Excel)                     |
 * | @    | Formula prefix (Excel, Lotus-style)        |
 * | \t   | Tab — can shift cell context               |
 * | \r   | Carriage return — can break cell boundary  |
 * | |    | Pipe — DDE attack vector                   |
 * | %    | Percent — some parsers interpret           |
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
 * Empty strings and non-string values are considered safe.
 */
export function hasCsvInjection(value: string): boolean {
  if (!value || value.length === 0) return false;
  return INJECTION_TRIGGER_CHARS.has(value[0]!);
}

/**
 * Sanitises a string for safe inclusion in a CSV export by prepending a
 * single-quote (`'`) when the value starts with an injection trigger character.
 *
 * The leading apostrophe is the standard spreadsheet convention for forcing
 * a cell to be treated as plain text. It is invisible in the cell display
 * but present in the raw file, making it safe for round-trip CSV processing.
 *
 * USE THIS on every user-generated string field in CSV exports.
 *
 * @example sanitizeCsvField("=EVIL()") → "'=EVIL()"
 * @example sanitizeCsvField("João")   → "João"   (no change)
 * @example sanitizeCsvField(null)     → ""
 */
export function sanitizeCsvField(value: string | null | undefined): string {
  if (value == null) return "";
  if (hasCsvInjection(value)) return `'${value}`;
  return value;
}
