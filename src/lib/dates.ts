/**
 * Dates in the dataset can be exact (`2026-08-14`), month-precision (`2026-08`),
 * and/or marked approximate with a leading tilde (`~2026-08`). Everything that
 * computes with dates goes through `parseDate` so precision is never lost.
 */

export type Precision = 'day' | 'month';

export interface PartialDate {
  raw: string;
  /** Midnight UTC. Month-precision dates resolve to the 15th to keep errors symmetric. */
  date: Date;
  precision: Precision;
  approx: boolean;
}

export const DATE_PATTERN = /^~?\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

const DAY_MS = 86_400_000;

export function parseDate(raw: string): PartialDate {
  const value = raw.trim();
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`Invalid date "${raw}" (expected YYYY-MM-DD, YYYY-MM, optionally prefixed with ~)`);
  }
  const approx = value.startsWith('~');
  const [y, m, d] = value.replace('~', '').split('-').map(Number) as [number, number, number?];
  const precision: Precision = d === undefined ? 'month' : 'day';
  const date = new Date(Date.UTC(y, m - 1, d ?? 15));
  if (date.getUTCMonth() !== m - 1) throw new Error(`Invalid calendar date "${raw}"`);
  return { raw: value, date, precision, approx };
}

/** True when a value derived from this date should be shown as approximate. */
export function isFuzzy(...dates: (PartialDate | undefined)[]): boolean {
  return dates.some((d) => d !== undefined && (d.approx || d.precision === 'month'));
}

export function daysBetween(from: PartialDate | Date, to: PartialDate | Date): number {
  const a = from instanceof Date ? from : from.date;
  const b = to instanceof Date ? to : to.date;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function compareDates(a: PartialDate, b: PartialDate): number {
  return a.date.getTime() - b.date.getTime();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(d: PartialDate | undefined): string {
  if (!d) return 'Unknown';
  const month = MONTHS[d.date.getUTCMonth()];
  const year = d.date.getUTCFullYear();
  const body = d.precision === 'month' ? `${month} ${year}` : `${month} ${d.date.getUTCDate()}, ${year}`;
  return d.approx ? `~${body}` : body;
}

export function formatPlainDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Human duration. Fuzzy values are rounded to coarser units and prefixed with `~`. */
export function formatDuration(days: number, fuzzy = false): string {
  const d = Math.max(0, days);
  const prefix = fuzzy ? '~' : '';
  if (d < 14 && !fuzzy) return `${d} day${d === 1 ? '' : 's'}`;
  if (d < 60) {
    const w = Math.max(1, Math.round(d / 7));
    return `${prefix}${w} week${w === 1 ? '' : 's'}`;
  }
  if (d < 730) {
    const m = Math.round(d / 30.44);
    return `${prefix}${m} month${m === 1 ? '' : 's'}`;
  }
  const y = Math.round((d / 365.25) * 10) / 10;
  return `${prefix}${y} years`;
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
