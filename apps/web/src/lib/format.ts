/**
 * Format a cents integer as Brazilian Real currency string.
 * @example formatBRL(14990) -> "R$ 149,90"
 */
export const formatBRL = (cents: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);

/**
 * Parse a price string (e.g. "149.90" or "149,90") to integer cents.
 * Handles both dot and comma as decimal separator.
 */
export const parsePriceToCents = (value: string): number => {
  const normalized = value.replace(",", ".");
  const numeric = parseFloat(normalized);
  return isNaN(numeric) ? 0 : Math.round(numeric * 100);
};

/**
 * Convert integer cents to a decimal string suitable for <input type="number">.
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
 * Formats a numeric string into a CPF mask.
 * @example formatCPF("12345678901") -> "123.456.789-01"
 */
export function formatCPF(cpf: string): string {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/**
 * Formats a numeric string into a Brazilian phone mask (supports 10 and 11 digits).
 * @example formatPhone("11988887777") -> "(11) 98888-7777"
 */
export function formatPhone(phone: string): string {
  if (phone.length === 11) {
    return phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }
  return phone.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}

/**
 * Formats an ISO "YYYY-MM" string to a short pt-BR month/year label.
 * @example formatMonthLabel("2025-03") -> "mar/25"
 */
export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    .replace(". de ", "/")
    .replace(".", "");
}

/**
 * Formats an ISO "YYYY-MM" period string to a pt-BR full month label.
 * @example formatPeriod("2025-03") -> "mar 2025"
 */
export function formatPeriod(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  })
    .format(new Date(year, month - 1, 1))
    .replace(".", "");
}

/**
 * Formats an ISO date string to DD/MM.
 */
export function formatDateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(isoDate));
}

/**
 * Formats an ISO date string "YYYY-MM-DD" without timezone shift.
 */
export function formatDateISO(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/**
 * Formats a Date object or ISO datetime string for display.
 */
export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(date));
}
