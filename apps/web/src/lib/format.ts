/**
 * Format a cents integer as Brazilian Real currency string.
 * @example formatBRL(14990) → "R$ 149,90"
 */
export const formatBRL = (cents: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);

/**
 * Parse a price string (e.g. "149.90" or "149,90") to integer cents.
 * Handles both dot and comma as decimal separator.
 * @example parsePriceToCents("149.90") → 14990
 */
export const parsePriceToCents = (value: string): number => {
  const normalized = value.replace(",", ".");
  const numeric = parseFloat(normalized);
  return isNaN(numeric) ? 0 : Math.round(numeric * 100);
};

/**
 * Convert integer cents to a decimal string suitable for <input type="number">.
 * @example centsToInputValue(14990) → "149.90"
 */
export const centsToInputValue = (cents: number): string =>
  (cents / 100).toFixed(2);

/**
 * Human-readable labels for plan billing intervals.
 */
export const intervalLabel: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  annual: "Anual",
};

/**
 * Formats an ISO date string "YYYY-MM-DD" without timezone shift.
 * Use for dates stored as date-only values (no time component).
 */
export function formatDateISO(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

/**
 * Formats a Date object or ISO datetime string for display.
 * Use for timestamps (createdAt, paidAt, etc.) where timezone is relevant.
 */
export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
}
