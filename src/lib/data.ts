/**
 * Builds the derived model every page renders from: statuses, scores, events
 * and site-wide stats. Loaded once per build and memoized.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { compareDates, daysBetween, formatDuration, parseDate, type PartialDate } from './dates';
import { checkIntegrity } from './integrity';
import { loadLab, recovered, type Sample } from './lab';
import { computeScore, type LabSummary, type Score } from './score';
import { SITE } from './site';
import { collectHits, deriveVersionStatus, median, type DeobfuscatorLike, type VersionStatus } from './status';
import { BYPASS_TO_STATUS, type EventKind, type Status } from './taxonomy';

type ObfData = CollectionEntry<'obfuscators'>['data'];
type DeobData = CollectionEntry<'deobfuscators'>['data'];
type AuthData = CollectionEntry<'auth'>['data'];
export type SourceRef = ObfData['sources'][number];

export interface VersionView {
  version: string;
  notes?: string;
  sources: SourceRef[];
  s: VersionStatus;
  isLatest: boolean;
}

export interface ObfuscatorView {
  id: string;
  data: ObfData;
  versions: VersionView[];
  latest: VersionView;
  status: Status;
  score: Score;
  /** Deobfuscators covering any version, most recent first. */
  deobfuscators: string[];
  lab?: LabSummary;
  stale: boolean;
}

export interface CoverageView {
  obfuscator: string;
  obfuscatorName: string;
  version: string;
  support: DeobData['targets'][number]['support'];
  effect: 'break' | 'partial';
  isLatest: boolean;
  notes?: string;
}

export interface DeobfuscatorView {
  id: string;
  data: DeobData;
  firstSeen?: PartialDate;
  coverage: CoverageView[];
  breaksLatest: boolean;
  stale: boolean;
}

export interface AuthView {
  id: string;
  data: AuthData;
  status: Status;
  stale: boolean;
}

export interface TimelineEvent {
  id: string;
  date: PartialDate;
  kind: EventKind;
  title: string;
  summary?: string;
  href?: string;
  obfuscator?: string;
  deobfuscator?: string;
  sources: SourceRef[];
}

export interface SiteData {
  obfuscators: ObfuscatorView[];
  deobfuscators: DeobfuscatorView[];
  auth: AuthView[];
  events: TimelineEvent[];
  samples: Sample[];
  obf: Map<string, ObfuscatorView>;
  deob: Map<string, DeobfuscatorView>;
  stats: {
    obfuscators: number;
    deobfuscators: number;
    auth: number;
    holding: number;
    partial: number;
    broken: number;
    medianDaysToBreak?: number;
    medianFuzzy: boolean;
  };
  builtAt: Date;
}

let cache: Promise<SiteData> | undefined;

export function getSiteData(): Promise<SiteData> {
  cache ??= build();
  return cache;
}

function isStale(lastVerified: string, now: Date): boolean {
  return daysBetween(parseDate(lastVerified), now) > SITE.staleAfterDays;
}

async function build(): Promise<SiteData> {
  const now = new Date();
  const [obfEntries, deobEntries, authEntries, eventEntries] = await Promise.all([
    getCollection('obfuscators'),
    getCollection('deobfuscators'),
    getCollection('auth'),
    getCollection('events'),
  ]);
  const { samples } = loadLab();

  const deobLike: DeobfuscatorLike[] = deobEntries.map((d) => ({
    id: d.id,
    access: d.data.access,
    outputLevel: d.data.outputLevel,
    firstSeen: d.data.firstSeen,
    targets: d.data.targets.map((t) => ({ ...t, obfuscator: t.obfuscator.id })),
  }));

  const errors = checkIntegrity({
    obfuscators: obfEntries.map((o) => ({ id: o.id, versions: o.data.versions })),
    deobfuscators: deobLike,
    labRuns: samples.flatMap((s) => s.runs.map((r) => ({ ...r, sample: s.id }))),
  });
  if (errors.length) throw new Error(`Data integrity check failed:\n  - ${errors.join('\n  - ')}`);

  const obfuscators: ObfuscatorView[] = obfEntries.map((o) => {
    const versions: VersionView[] = o.data.versions.map((v, i) => ({
      version: v.version,
      notes: v.notes,
      sources: v.sources,
      s: deriveVersionStatus(v, collectHits(o.id, v.version, deobLike)),
      isLatest: i === o.data.versions.length - 1,
    }));
    const latest = versions[versions.length - 1]!;

    const runs = samples.flatMap((s) => s.runs.filter((r) => r.obfuscator === o.id && r.version === latest.version));
    const lab = runs.length ? { tested: runs.length, recovered: runs.filter(recovered).length } : undefined;

    const deobs = [...new Set(versions.flatMap((v) => v.s.hits.map((h) => h.deobfuscator)))];

    return {
      id: o.id,
      data: o.data,
      versions,
      latest,
      status: latest.s.status,
      score: computeScore({
        latest: latest.s,
        versions: versions.map((v) => v.s),
        techniques: o.data.techniques,
        lab,
        now,
      }),
      deobfuscators: deobs,
      lab,
      stale: isStale(o.data.lastVerified, now),
    };
  });
  obfuscators.sort((a, b) => b.score.total - a.score.total || a.data.name.localeCompare(b.data.name));
  const obf = new Map(obfuscators.map((o) => [o.id, o]));

  const deobfuscators: DeobfuscatorView[] = deobEntries.map((d) => {
    const coverage: CoverageView[] = d.data.targets.flatMap((t) => {
      const o = obf.get(t.obfuscator.id)!;
      return t.versions.map((version) => {
        const hit = o.versions.find((v) => v.version === version)!.s.hits.find((h) => h.deobfuscator === d.id)!;
        return {
          obfuscator: o.id,
          obfuscatorName: o.data.name,
          version,
          support: t.support,
          effect: hit.effect,
          isLatest: o.latest.version === version,
          notes: t.notes,
        };
      });
    });
    return {
      id: d.id,
      data: d.data,
      firstSeen: d.data.firstSeen ? parseDate(d.data.firstSeen) : undefined,
      coverage,
      breaksLatest: coverage.some((c) => c.isLatest && c.effect === 'break'),
      stale: isStale(d.data.lastVerified, now),
    };
  });
  deobfuscators.sort(
    (a, b) =>
      Number(b.breaksLatest) - Number(a.breaksLatest) ||
      (b.firstSeen?.date.getTime() ?? 0) - (a.firstSeen?.date.getTime() ?? 0) ||
      a.data.name.localeCompare(b.data.name),
  );
  for (const o of obfuscators) {
    o.deobfuscators.sort((a, b) => deobfuscators.findIndex((d) => d.id === a) - deobfuscators.findIndex((d) => d.id === b));
  }
  const deob = new Map(deobfuscators.map((d) => [d.id, d]));

  const auth: AuthView[] = authEntries
    .map((a) => ({
      id: a.id,
      data: a.data,
      status: BYPASS_TO_STATUS[a.data.bypass.status],
      stale: isStale(a.data.lastVerified, now),
    }))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  const events = deriveEvents(obfuscators, deob, eventEntries);

  const ttb = obfuscators.flatMap((o) => o.versions.map((v) => v.s)).filter((s) => s.daysToBreak !== undefined);
  const count = (s: Status) => obfuscators.filter((o) => o.status === s).length;

  return {
    obfuscators,
    deobfuscators,
    auth,
    events,
    samples,
    obf,
    deob,
    stats: {
      obfuscators: obfuscators.length,
      deobfuscators: deobfuscators.length,
      auth: auth.length,
      holding: count('holding'),
      partial: count('partial'),
      broken: count('broken'),
      medianDaysToBreak: median(ttb.map((s) => s.daysToBreak!)),
      medianFuzzy: ttb.some((s) => s.fuzzy),
    },
    builtAt: now,
  };
}

function deriveEvents(
  obfuscators: ObfuscatorView[],
  deob: Map<string, DeobfuscatorView>,
  manual: CollectionEntry<'events'>[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const breakDates = new Set<string>();

  for (const o of obfuscators) {
    for (const v of o.versions) {
      const label = `${o.data.name} ${formatVersion(v.version)}`;
      if (v.s.released) {
        events.push({
          id: `release-${o.id}-${v.version}`,
          date: v.s.released,
          kind: 'release',
          title: `${label} released`,
          href: `/obfuscators/${o.id}`,
          obfuscator: o.id,
          sources: v.sources.length ? v.sources : o.data.sources,
        });
      }
      if (v.s.status === 'broken' && v.s.brokenOn) {
        const first = v.s.decisive[0]!;
        const tool = deob.get(first.deobfuscator)!;
        breakDates.add(`${tool.id}|${v.s.brokenOn.raw}`);
        events.push({
          id: `break-${o.id}-${v.version}`,
          date: v.s.brokenOn,
          kind: 'break',
          title: `${label} broken`,
          summary:
            `Readable source recoverable with ${tool.data.name}` +
            (v.s.daysToBreak !== undefined ? `, ${formatDuration(v.s.daysToBreak, v.s.fuzzy)} after release.` : '.'),
          href: `/obfuscators/${o.id}`,
          obfuscator: o.id,
          deobfuscator: tool.id,
          sources: tool.data.sources,
        });
      }
    }
  }

  for (const d of deob.values()) {
    if (!d.firstSeen || breakDates.has(`${d.id}|${d.firstSeen.raw}`)) continue;
    const targets = [...new Set(d.coverage.map((c) => c.obfuscatorName))].join(', ');
    events.push({
      id: `deob-${d.id}`,
      date: d.firstSeen,
      kind: 'deobfuscator',
      title: `${d.data.name} published`,
      summary: `Targets ${targets}.`,
      href: `/deobfuscators/${d.id}`,
      deobfuscator: d.id,
      sources: d.data.sources,
    });
  }

  for (const e of manual) {
    events.push({
      id: e.id,
      date: parseDate(e.data.date),
      kind: e.data.kind,
      title: e.data.title,
      summary: e.data.summary,
      obfuscator: e.data.obfuscator?.id,
      deobfuscator: e.data.deobfuscator?.id,
      href: e.data.obfuscator
        ? `/obfuscators/${e.data.obfuscator.id}`
        : e.data.deobfuscator
          ? `/deobfuscators/${e.data.deobfuscator.id}`
          : undefined,
      sources: e.data.sources,
    });
  }

  return events.sort((a, b) => compareDates(b.date, a.date));
}

/** "15" → "v15", "main" → "main", "current" → "current". */
export function formatVersion(v: string): string {
  return /^\d/.test(v) ? `v${v}` : v;
}

/** Version as it reads mid-sentence: "v15", "the current version", "the main branch". */
export function versionPhrase(v: string): string {
  if (/^\d/.test(v)) return `v${v}`;
  if (v === 'current') return 'the current version';
  if (v === 'main' || v === 'master') return `the ${v} branch`;
  return v;
}
