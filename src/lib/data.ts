/**
 * Builds the derived model every page renders from: statuses, scores, events
 * and site-wide stats. Loaded once per build and memoized.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { compareDates, daysBetween, formatDuration, parseDate, type PartialDate } from './dates';
import { daysOpen } from './challenges';
import { checkIntegrity } from './integrity';
import { loadLab, recovered, type Sample } from './lab';
import { computeDeobScore, type DeobScore } from './deobScore';
import { compareScores, computeScore, provingDay, type LabSummary, type Score } from './score';
import { SITE } from './site';
import { collectHits, deriveVersionStatus, median, type DeobfuscatorLike, type VersionStatus } from './status';
import {
  BYPASS_TO_STATUS,
  CODEBASE_CRITERIA,
  RUNTIME_LABEL,
  segmentOf,
  type DisplayStatus,
  type EventKind,
  type Runtime,
  type Segment,
  type Status,
} from './taxonomy';

type ObfData = CollectionEntry<'obfuscators'>['data'];
type DeobData = CollectionEntry<'deobfuscators'>['data'];
type AuthData = CollectionEntry<'auth'>['data'];
export type SourceRef = ObfData['sources'][number];

export interface VersionView {
  version: string;
  /** Release date unknown: already out by this date (timeline placement only). */
  seen?: PartialDate;
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
  /** Commercial & maintained, or open source & legacy. */
  segment: Segment;
  openSource: boolean;
  /** Codebase rubric total for open-source projects. */
  codebase?: number;
  /** When luau.site started watching the (undated) latest version, if it is being observed. */
  observedSince?: PartialDate;
  score: Score;
  /** Deobfuscators covering any version, most recent first. */
  deobfuscators: string[];
  /** Env loggers that claim to get past its anti-tamper. Informational; they never change its status. */
  envLoggers: { id: string; note?: string }[];
  /** The tracked obfuscator this one is a fork of or built on. */
  basedOn?: string;
  /** Tracked obfuscators that are forks of or built on this one. */
  derivatives: string[];
  lab?: LabSummary;
  stale: boolean;
}

export interface CoverageView {
  obfuscator: string;
  obfuscatorName: string;
  version: string;
  segment: Segment;
  support: DeobData['targets'][number]['support'];
  effect: 'break' | 'partial';
  isLatest: boolean;
  notes?: string;
}

/** Directory group of a tool: what it is useful against. */
export type DeobGroup = 'current' | 'legacy' | 'decompiler' | 'env-logger';

export interface DeobfuscatorView {
  id: string;
  data: DeobData;
  firstSeen?: PartialDate;
  coverage: CoverageView[];
  breaksLatest: boolean;
  /** Tools for commercial obfuscators, tools for legacy ones, decompilers or env loggers. */
  group: DeobGroup;
  score: DeobScore;
  stale: boolean;
}

export interface AuthView {
  id: string;
  data: AuthData;
  /** Key system / whitelist bypass status. */
  status: Status;
  /** Deobfuscation status of scripts protected by the service, if known. */
  protection?: Status;
  segment: Segment;
  stale: boolean;
}

/** An unbroken, closed-source latest version and how long it has stood. */
export interface StandingView {
  obfuscator: string;
  version: string;
  /** Start of the unbroken stretch: an open challenge, the release, or the start of observation. */
  since: PartialDate;
  days: number;
  reason: 'challenge' | 'release' | 'observation';
  challenge?: ObfData['challenges'][number];
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
  /** Whether the event concerns a commercial & maintained obfuscator (or the site itself). */
  segment: Segment;
}

export interface SiteData {
  obfuscators: ObfuscatorView[];
  deobfuscators: DeobfuscatorView[];
  auth: AuthView[];
  events: TimelineEvent[];
  /** Unbroken latest versions, longest-standing first. */
  standing: StandingView[];
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
    obfuscators: obfEntries.map((o) => ({ id: o.id, versions: o.data.versions, basedOn: o.data.basedOn?.id })),
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
        seen: v.seen ? parseDate(v.seen) : undefined,
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
      segment: segmentOf(o.data),
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
      envLoggers: deobEntries.flatMap((d) =>
        d.data.bypasses.filter((b) => b.obfuscator.id === o.id).map((b) => ({ id: d.id, note: b.note })),
      ),
      basedOn: o.data.basedOn?.id,
      derivatives: obfEntries.filter((x) => x.data.basedOn?.id === o.id).map((x) => x.id),
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
          segment: o.segment,
          support: t.support,
          effect: hit.effect,
          isLatest: o.latest.version === version,
          notes: t.notes,
        };
      });
    });
    const score = computeDeobScore({
      kind: d.data.kind,
      access: d.data.access,
      outputLevel: d.data.outputLevel,
      maintenance: d.data.maintenance,
      now,
      coverage: coverage.map((c) => {
        const o = obf.get(c.obfuscator)!;
        const i = o.versions.findIndex((v) => v.version === c.version);
        const hit = o.versions[i]!.s.hits.find((h) => h.deobfuscator === d.id);
        return {
          obfuscator: c.obfuscator,
          version: c.version,
          segment: c.segment,
          latest: c.isLatest,
          supersededOn: o.versions[i + 1]?.s.released,
          effect: c.effect,
          difficulty: hit?.difficulty,
        };
      }),
    });
    return {
      id: d.id,
      data: d.data,
      firstSeen: d.data.firstSeen ? parseDate(d.data.firstSeen) : undefined,
      coverage,
      breaksLatest: coverage.some((c) => c.isLatest && c.effect === 'break'),
      group: (d.data.kind !== 'deobfuscator'
        ? d.data.kind
        : coverage.some((c) => c.segment === 'current')
          ? 'current'
          : 'legacy') as DeobGroup,
      score,
      stale: isStale(d.data.lastVerified, now),
    };
  });
  deobfuscators.sort(
    (a, b) =>
      b.score.total - a.score.total ||
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
      segment: segmentOf(a.data),
      stale: isStale(a.data.lastVerified, now),
    }))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));

  const events = deriveEvents(obfuscators, deob, eventEntries, now);
  const standing = deriveStanding(obfuscators, now);

  const ttb = obfuscators.flatMap((o) => o.versions.map((v) => v.s)).filter((s) => s.daysToBreak !== undefined);
  const count = (s: DisplayStatus) => obfuscators.filter((o) => o.status === s).length;

  return {
    obfuscators,
    deobfuscators,
    auth,
    events,
    standing,
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

function deriveStanding(obfuscators: ObfuscatorView[], now: Date): StandingView[] {
  const out: StandingView[] = [];
  for (const o of obfuscators) {
    const s = o.latest.s;
    if (o.openSource || s.status !== 'holding') continue;
    const challenge = o.data.challenges
      .filter((c) => c.status === 'open')
      .sort((a, b) => compareDates(parseDate(a.posted), parseDate(b.posted)))[0];
    // A dated version has stood since its release; an open challenge only starts the clock for an
    // undated one (it is still reported, and drawn on the timeline, either way).
    const since = s.released ?? (challenge ? parseDate(challenge.posted) : o.observedSince);
    if (!since) continue;
    out.push({
      obfuscator: o.id,
      version: o.latest.version,
      since,
      days: Math.max(0, daysBetween(since, now)),
      reason: s.released ? 'release' : challenge ? 'challenge' : 'observation',
      challenge,
    });
  }
  return out.sort((a, b) => b.days - a.days || a.obfuscator.localeCompare(b.obfuscator));
}

function deriveEvents(
  obfuscators: ObfuscatorView[],
  deob: Map<string, DeobfuscatorView>,
  manual: CollectionEntry<'events'>[],
  now: Date,
): TimelineEvent[] {
  const events: Omit<TimelineEvent, 'segment'>[] = [];
  const breakDates = new Set<string>();

  for (const o of obfuscators) {
    // Versions broken on the same day by the same tool read as one event.
    const breaks = new Map<string, VersionView[]>();
    for (const v of o.versions) {
      if (v.s.released) {
        events.push({
          id: `release-${o.id}-${v.version}`,
          date: v.s.released,
          kind: 'release',
          title: `${o.data.name} ${formatVersion(v.version)} released`,
          href: `/obfuscators/${o.id}`,
          obfuscator: o.id,
          sources: v.sources.length ? v.sources : o.data.sources,
        });
      }
      if (v.s.status === 'broken' && v.s.brokenOn) {
        const key = `${v.s.brokenOn.raw}|${v.s.decisive[0]?.deobfuscator ?? `manual-${v.version}`}`;
        breaks.set(key, [...(breaks.get(key) ?? []), v]);
      }
    }
    for (const group of breaks.values()) {
      const first = group[0]!;
      const timed = group.find((v) => v.s.daysToBreak !== undefined);
      if (first.s.manual) {
        // No tool behind it: the override's note says how it was broken.
        events.push({
          id: `break-${o.id}-${group.map((v) => v.version).join('-')}`,
          date: first.s.brokenOn!,
          kind: 'break',
          title: /^\d/.test(first.version) ? `${o.data.name} ${formatVersion(first.version)} broken` : `${o.data.name} broken`,
          summary:
            (first.s.statusNote ?? 'Broken without a public tool.') +
            (timed ? ` ${formatDuration(timed.s.daysToBreak!, timed.s.fuzzy)} after release.` : ''),
          href: `/obfuscators/${o.id}`,
          obfuscator: o.id,
          sources: first.sources.length ? first.sources : o.data.sources,
        });
        continue;
      }
      const tool = deob.get(first.s.decisive[0]!.deobfuscator)!;
      breakDates.add(`${tool.id}|${first.s.brokenOn!.raw}`);
      events.push({
        id: `break-${o.id}-${group.map((v) => v.version).join('-')}`,
        date: first.s.brokenOn!,
        kind: 'break',
        // Rolling names like "main" or "current" add nothing to a headline.
        title: group.every((v) => /^\d/.test(v.version))
          ? `${o.data.name} ${listVersions(group.map((v) => v.version))} broken`
          : `${o.data.name} broken`,
        summary:
          `Readable source recoverable with ${tool.data.name}` +
          (timed
            ? `, ${formatDuration(timed.s.daysToBreak!, timed.s.fuzzy)} after ${group.length > 1 ? `${formatVersion(timed.version)}'s ` : ''}release.`
            : '.'),
        href: `/obfuscators/${o.id}`,
        obfuscator: o.id,
        deobfuscator: tool.id,
        sources: tool.data.sources,
      });
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
      summary:
        d.data.kind === 'decompiler'
          ? `Decompiles ${listRuntimes(d.data.decompiles)} bytecode.`
          : d.data.kind === 'env-logger' && !targets
            ? 'Logs what a protected script does at runtime.'
            : `Targets ${targets}.`,
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

  // An event belongs to the commercial segment when its obfuscator does, or when its tool is
  // aimed at a commercial obfuscator. Site-wide notes stay visible everywhere.
  const obfSegment = new Map(obfuscators.map((o) => [o.id, o.segment]));
  const segmentFor = (e: Omit<TimelineEvent, 'segment'>): Segment =>
    e.obfuscator
      ? (obfSegment.get(e.obfuscator) ?? 'current')
      : e.deobfuscator
        ? deob.get(e.deobfuscator)?.group === 'current'
          ? 'current'
          : 'legacy'
        : 'current';
  return events.map((e) => ({ ...e, segment: segmentFor(e) })).sort((a, b) => compareDates(b.date, a.date));
}

/** ["luau", "lua51"] → "Luau and Lua 5.1". */
export function listRuntimes(runtimes: readonly Runtime[]): string {
  const r = runtimes.map((x) => RUNTIME_LABEL[x]);
  return r.length < 3 ? r.join(' and ') : `${r.slice(0, -1).join(', ')} and ${r.at(-1)}`;
}

/** ["14.8", "14.9"] → "v14.8 and v14.9"; three or more get commas. */
export function listVersions(versions: string[]): string {
  const v = versions.map(formatVersion);
  return v.length < 3 ? v.join(' and ') : `${v.slice(0, -1).join(', ')} and ${v.at(-1)}`;
}

/** "15" → "v15", "main" → "main", "current" → "current". */
export function formatVersion(v: string): string {
  return /^\d/.test(v) ? `v${v}` : v;
}

/** Version as it reads mid-sentence: "v15", "the current version", "the main branch", 'the "Execution receipts" release'. */
export function versionPhrase(v: string): string {
  if (/^\d/.test(v)) return `v${v}`;
  if (v === 'current') return 'the current version';
  if (v === 'main' || v === 'master') return `the ${v} branch`;
  return `the "${v}" release`;
}
