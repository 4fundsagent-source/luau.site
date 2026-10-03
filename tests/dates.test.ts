import { describe, expect, it } from 'vitest';
import { daysBetween, formatDate, formatDuration, isFuzzy, parseDate } from '../src/lib/dates';

describe('parseDate', () => {
  it('parses exact dates', () => {
    const d = parseDate('2026-08-14');
    expect(d.precision).toBe('day');
    expect(d.approx).toBe(false);
    expect(d.date.toISOString()).toBe('2026-08-14T00:00:00.000Z');
  });

  it('resolves month precision to the 15th', () => {
    const d = parseDate('2026-08');
    expect(d.precision).toBe('month');
    expect(d.date.getUTCDate()).toBe(15);
  });

  it('marks tilde dates as approximate', () => {
    expect(parseDate('~2026-08').approx).toBe(true);
    expect(isFuzzy(parseDate('~2026-08-01'))).toBe(true);
    expect(isFuzzy(parseDate('2026-08-01'))).toBe(false);
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => parseDate('2026-13')).toThrow();
    expect(() => parseDate('2026-02-30')).toThrow();
    expect(() => parseDate('Aug 2026')).toThrow();
  });
});

describe('formatting', () => {
  it('formats by precision', () => {
    expect(formatDate(parseDate('2026-08-14'))).toBe('Aug 14, 2026');
    expect(formatDate(parseDate('~2026-08'))).toBe('~Aug 2026');
  });

  it('formats durations', () => {
    expect(formatDuration(1)).toBe('1 day');
    expect(formatDuration(10)).toBe('10 days');
    expect(formatDuration(23)).toBe('3 weeks');
    expect(formatDuration(23, true)).toBe('~3 weeks');
    expect(formatDuration(120)).toBe('4 months');
    expect(formatDuration(1000)).toBe('2.7 years');
  });

  it('counts days between dates', () => {
    expect(daysBetween(parseDate('2026-08-01'), parseDate('2026-08-24'))).toBe(23);
  });
});
