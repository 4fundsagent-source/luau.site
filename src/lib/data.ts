/**
 * Builds the derived model every page renders from: statuses, scores, events
 * and site-wide stats. Loaded once per build and memoized.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { compareDates, daysBetween, formatDuration, parseDate, type PartialDate } from './dates';
import { daysOpen } from './challenges';
import { checkIntegrity } from './integrity';
import { loadLab, recovered, type Sample } from './lab';
import { compareScores, computeScore, provingDay, type LabSummary, type Score } from './score';
import { SITE } from './site';
import { collectHits, deriveVersionStatus, median, type DeobfuscatorLike, type VersionStatus } from './status';
import { BYPASS_TO_STATUS, CODEBASE_CRITERIA, type DisplayStatus, type EventKind, type Status } from './taxonomy';

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
  /** Days into the proving period, for a new unbroken release. */
  provingDay?: number;
}

export interface ObfuscatorView {
  id: string;
  data: ObfData;
  versions: VersionView[];
  latest: VersionView;
  /** Project-level status: open-source projects never show as "holding". */
  status: DisplayStatus;
  openSource: boolean;
  /** Codebase rubric total for open-source projects. */
  codebase?: number;
  /** When luau.site started watching the (undated) latest version, if it is being observed. */
  observedSince?: PartialDate;
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
  /** Key system / whitelist bypass status. */
  status: Status;
  /** Deobfuscation status of scripts protected by the service, if known. */
  protection?: Status;
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
    open: number;
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
  // Day-granular "today" so durations and proving days don't depend on the build's time of day.
  const clock = new Date();
  const now = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()));
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
    // Observation start for an undated latest version: an explicit observation or the
    // earliest open public challenge, whichever came first.
    const starts = [
      o.data.observation?.since,
      ...o.data.challenges.filter((c) => c.status === 'open').map((c) => c.posted),
    ]
      .filter((d): d is string => Boolean(d))
      .map((d) => parseDate(d))
      .sort(compareDates);
    const observedSince = starts[0];

    const versions: VersionView[] = o.data.versions.map((v, i) => {
      const s = deriveVersionStatus(v, collectHits(o.id, v.version, deobLike));
      const isLatest = i === o.data.versions.length - 1;
      if (isLatest && !s.released && observedSince) s.observedSince = observedSince;
      return {
        version: v.version,
        notes: v.notes,
        sources: v.sources,
        s,
        isLatest,
        provingDay: isLatest ? provingDay(s, now) : undefined,
      };
    });
    const latest = versions[versions.length - 1]!;
    const previous = versions[versions.length - 2];
    const openSource = o.data.pricing === 'open-source';
    const cb = o.data.codebase;
    const codebase = openSource && cb ? CODEBASE_CRITERIA.reduce((sum, c) => sum + cb[c], 0) : undefined;

    const runs = samples.flatMap((s) => s.runs.filter((r) => r.obfuscator === o.id && r.version === latest.version));
    const lab = runs.length ? { tested: runs.length, recovered: runs.filter(recovered).length } : undefined;

    const deobs = [...new Set(versions.flatMap((v) => v.s.hits.map((h) => h.deobfuscator)))];

    return {
      id: o.id,
      data: o.data,
      versions,
      latest,
      status: openSource && latest.s.status === 'holding' ? 'open' : latest.s.status,
      openSource,
      codebase,
      observedSince: latest.s.observedSince,
      score: computeScore({
        latest: latest.s,
        previous: previous?.s,
        versions: versions.map((v) => v.s),
        techniques: o.data.techniques,
        lab,
        codebase,
        disclosure: o.data.disclosure,
        now,
      }),
      deobfuscators: deobs,
      lab,
      stale: isStale(o.data.lastVerified, now),
    };
  });
  obfuscators.sort((a, b) => compareScores(a.score, b.score) || a.data.name.localeCompare(b.data.name));
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
      protection: a.data.protection?.status,
      stale: isStale(a.data.lastVerified, now),
    }))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  const events = deriveEvents(obfuscators, deob, eventEntries, now);

  const ttb = obfuscators.flatMap((o) => o.versions.map((v) => v.s)).filter((s) => s.daysToBreak !== undefined);
  const count = (s: DisplayStatus) => obfuscators.filter((o) => o.status === s).length;

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
      open: count('open'),
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
  now: Date,
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

  for (const o of obfuscators) {
    for (const c of o.data.challenges) {
      events.push({
        id: `challenge-${o.id}-${c.posted}`,
        date: parseDate(c.posted),
        kind: 'challenge',
        title: `${o.data.name} posts a public ${c.platform} challenge${c.bounty ? ` (${c.bounty} bounty)` : ''}`,
        summary: [
          c.difficulty !== undefined ? `Rated ${c.difficulty}/${c.difficultyScale} difficulty.` : '',
          c.status === 'open' ? `Unsolved after ${daysOpen(c, now)} days.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        href: `/obfuscators/${o.id}#challenges`,
        obfuscator: o.id,
        sources: c.sources,
      });
      if (c.status === 'solved' && c.solvedOn) {
        events.push({
          id: `challenge-solved-${o.id}-${c.solvedOn}`,
          date: parseDate(c.solvedOn),
          kind: 'challenge',
          title: `${o.data.name}'s ${c.platform} challenge solved`,
          href: `/obfuscators/${o.id}#challenges`,
          obfuscator: o.id,
          sources: c.sources,
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
