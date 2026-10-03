/**
 * Version status is derived from deobfuscator coverage — never typed by hand.
 * A manual override exists for edge cases, but the schema requires a note and
 * sources alongside it.
 */
import { daysBetween, isFuzzy, parseDate, type PartialDate } from './dates';
import type { Access, OutputLevel, Status, Support } from './taxonomy';

export interface CoverageTarget {
  obfuscator: string;
  versions: string[];
  support: Support;
  /**
   * When support for these versions shipped, if later than the tool's first release.
   * `unknown` means the date is not known: no date is shown and firstSeen is not assumed.
   */
  since?: string;
  notes?: string;
}

export interface DeobfuscatorLike {
  id: string;
  access: Access;
  outputLevel: OutputLevel;
  firstSeen?: string;
  targets: CoverageTarget[];
}

export interface VersionLike {
  version: string;
  released?: string;
  status?: Status;
  statusNote?: string;
}

/** One deobfuscator's coverage of one obfuscator version. */
export interface Hit {
  deobfuscator: string;
  access: Access;
  outputLevel: OutputLevel;
  support: Support;
  /** When this coverage became public, if known. */
  date?: PartialDate;
  effect: 'break' | 'partial';
  notes?: string;
}

export interface VersionStatus {
  status: Status;
  hits: Hit[];
  /** Hits that produced the current status (breaks if broken, partials if partial). */
  decisive: Hit[];
  released?: PartialDate;
  brokenOn?: PartialDate;
  daysToBreak?: number;
  /** True when daysToBreak rests on month-precision or approximate dates. */
  fuzzy: boolean;
  /** Most exposed access level among breaking tools. */
  exposure?: Access;
  overridden: boolean;
  statusNote?: string;
}

const READABLE: OutputLevel[] = ['readable', 'near-original'];

/** Most exposed first: an open-source tool hurts more than a private one. */
export const EXPOSURE_ORDER: Access[] = ['open-source', 'free', 'paid', 'private'];

export function hitEffect(support: Support, outputLevel: OutputLevel): Hit['effect'] {
  return support === 'full' && READABLE.includes(outputLevel) ? 'break' : 'partial';
}

export function collectHits(obfuscatorId: string, version: string, deobfuscators: DeobfuscatorLike[]): Hit[] {
  const hits: Hit[] = [];
  for (const d of deobfuscators) {
    for (const t of d.targets) {
      if (t.obfuscator !== obfuscatorId || !t.versions.includes(version)) continue;
      hits.push({
        deobfuscator: d.id,
        access: d.access,
        outputLevel: d.outputLevel,
        support: t.support,
        date: t.since === 'unknown' ? undefined : dateOf(t.since ?? d.firstSeen),
        effect: hitEffect(t.support, d.outputLevel),
        notes: t.notes,
      });
    }
  }
  // Dated hits first, oldest first; undated hits keep their order at the end.
  return hits.sort((a, b) => (a.date?.date.getTime() ?? Infinity) - (b.date?.date.getTime() ?? Infinity));
}

function dateOf(raw: string | undefined): PartialDate | undefined {
  return raw ? parseDate(raw) : undefined;
}

export function deriveVersionStatus(version: VersionLike, hits: Hit[]): VersionStatus {
  const released = version.released ? parseDate(version.released) : undefined;
  const breaks = hits.filter((h) => h.effect === 'break');
  const partials = hits.filter((h) => h.effect === 'partial');

  let status: Status = breaks.length ? 'broken' : partials.length ? 'partial' : 'holding';
  const overridden = version.status !== undefined && version.status !== status;
  if (version.status) status = version.status;

  const decisive = status === 'broken' ? breaks : status === 'partial' ? partials : [];
  const brokenOn = status === 'broken' ? breaks[0]?.date : undefined;
  const daysToBreak = brokenOn && released ? Math.max(0, daysBetween(released, brokenOn)) : undefined;
  const exposure =
    status === 'broken' && breaks.length
      ? EXPOSURE_ORDER.find((a) => breaks.some((b) => b.access === a))
      : undefined;

  return {
    status,
    hits,
    decisive,
    released,
    brokenOn,
    daysToBreak,
    fuzzy: isFuzzy(released, brokenOn),
    exposure,
    overridden,
    statusNote: version.statusNote,
  };
}

/** Days a version stayed unbroken: time-to-break, or time since release if it is still holding. */
export function survivalDays(v: VersionStatus, now: Date): number | undefined {
  if (!v.released) return undefined;
  if (v.status === 'broken') return v.daysToBreak;
  return Math.max(0, daysBetween(v.released, now));
}

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
