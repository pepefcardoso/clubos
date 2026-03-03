/**
 * Computes the [start, end] UTC Date range for "today + offsetDays".
 * Shared by billing-reminder (D-3 look-ahead) and overdue-notice (D+3 look-back).
 *
 * @example offsetDays=3, now=2025-03-01  → [2025-03-04T00:00:00.000Z, 2025-03-04T23:59:59.999Z]
 * @example offsetDays=-3, now=2025-03-04 → [2025-03-01T00:00:00.000Z, 2025-03-01T23:59:59.999Z]
 *
 * @param offsetDays - Number of days from `now` to target. Negative values look back.
 * @param now        - Reference date. Defaults to current UTC time. Injected in tests.
 */
export function getTargetDayRange(
  offsetDays: number,
  now = new Date(),
): [Date, Date] {
  const base = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + offsetDays,
    ),
  );

  const end = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  return [base, end];
}
