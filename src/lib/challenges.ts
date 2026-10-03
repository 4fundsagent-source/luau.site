import { daysBetween, parseDate } from './dates';

interface ChallengeLike {
  posted: string;
  status: 'open' | 'solved';
  solvedOn?: string;
}

/** Days a challenge has been (or was) open. */
export function daysOpen(c: ChallengeLike, now: Date): number {
  const end = c.status === 'solved' && c.solvedOn ? parseDate(c.solvedOn).date : now;
  return Math.max(0, daysBetween(parseDate(c.posted), end));
}
