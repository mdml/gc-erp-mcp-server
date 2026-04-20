import type { IsoDay } from "@gc-erp/database";

/**
 * Returns `day` advanced by `n` working days (Mon–Fri; no holiday calendar).
 *
 * - n = 0: returns `day` verbatim — no normalization, even on a weekend.
 * - n < 0: throws RangeError.
 * - Weekend input + n > 0: advances to the following Monday first, then counts
 *   n working days from there. Saturday + 1 → Tuesday; Sunday + 1 → Tuesday.
 * - Dates are parsed and formatted as UTC to avoid DST artifacts.
 */
export function addWorkingDays(day: IsoDay, n: number): IsoDay {
  if (n < 0) {
    throw new RangeError(`addWorkingDays: n must be >= 0, got ${n}`);
  }
  if (n === 0) return day;

  const date = parseUtcDay(day);
  advanceToMonday(date);
  countWorkingDays(date, n);
  return formatUtcDay(date);
}

function parseUtcDay(day: IsoDay): Date {
  const [year, month, dom] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, dom));
}

/** If `date` falls on a weekend, advance it to the following Monday in-place. */
function advanceToMonday(date: Date): void {
  const dow = date.getUTCDay();
  // Sat(6)→+2, Sun(0)→+1, weekday→0
  const skip = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  if (skip > 0) date.setUTCDate(date.getUTCDate() + skip);
}

/** Advances `date` forward by exactly `n` weekdays in-place. */
function countWorkingDays(date: Date, n: number): void {
  let remaining = n;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (isWeekday(date)) remaining--;
  }
}

function isWeekday(date: Date): boolean {
  const d = date.getUTCDay();
  return d !== 0 && d !== 6;
}

function formatUtcDay(date: Date): IsoDay {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}` as IsoDay;
}
