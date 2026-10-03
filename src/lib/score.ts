/**
 * The luau.site Security Score. A pure function of the dataset: if the data
 * changes, the score changes — nobody types a score by hand.
 *
 * Components without data (no dated versions, no Lab runs, no documented
 * techniques) get neutral half credit instead of being re-normalized away — an
 * absence of evidence should neither inflate nor sink a score. `confidence` is
 * the share of the weight backed by real data: below PROVISIONAL_BELOW a score
 * is provisional, and below UNRATED_BELOW it is not ranked at all.
 *
 * Special rules:
 *  - Open source can never "hold". Resistance and track record are replaced by
 *    a graded Codebase rubric, missing data earns nothing (anyone can study the
 *    code, so there is no benefit of the doubt), and the total is capped at OSS_CAP.
 *  - A brand-new unbroken release is in a proving period: its Resistance ramps
 *    from its predecessor's level to full over PROVING_DAYS. Undated versions
 *    enter the same ramp from when luau.site started watching them (an explicit
 *    observation or an open public challenge), so survival is earned, not assumed.
 *  - Vendors that publish no versions or changelogs get no free track-record credit.
 *  - A broken version keeps a small bonus if even the easiest break was hard.
 */
import { daysBetween, formatDuration } from './dates';
import { median, survivalDays, type VersionStatus } from './status';
import { CODEBASE_MAX, TECHNIQUE_META, type Access, type Difficulty, type Disclosure, type Technique } from './taxonomy';

export const WEIGHTS = { resistance: 50, codebase: 40, track: 20, lab: 20, technique: 10 } as const;
export type ComponentKey = keyof typeof WEIGHTS;

/** Scores backed by less than this share of real data are labelled provisional. */
export const PROVISIONAL_BELOW = 0.7;

/** Below this share of real data a project is unrated: no tier, ranked last. */
export const UNRATED_BELOW = 0.55;

/** Days of median survival that earn full track-record points. */
export const TRACK_FULL_DAYS = 365;

/** Days a new, unbroken release needs before it earns full Resistance. */
export const PROVING_DAYS = 90;

/** Resistance a first-ever release starts its proving period from. */
const PROVING_BASELINE = 25;

/** Resistance kept by a broken version, by how hard its easiest break was. */
export const DIFFICULTY_BONUS: Record<Difficulty, number> = { easy: 0, moderate: 4, hard: 8 };

/** Highest total an open-source obfuscator can reach. */
export const OSS_CAP = 60;

/** Codebase points are scaled down when the latest version is already broken. */
export const OSS_STATUS_FACTOR = { holding: 1, partial: 0.75, broken: 0.5 } as const;

export const TIERS = [
  { tier: 'S', min: 85 },
  { tier: 'A', min: 70 },
  { tier: 'B', min: 55 },
  { tier: 'C', min: 40 },
  { tier: 'F', min: 0 },
] as const;
export type Tier = (typeof TIERS)[number]['tier'];

export interface LabSummary {
  tested: number;
  recovered: number;
}

export interface ScoreInput {
  latest: VersionStatus;
  /** The version before `latest`, if any — the baseline for the proving period. */
  previous?: VersionStatus;
  versions: VersionStatus[];
  techniques: Technique[];
  lab?: LabSummary;
  /** Present for open-source obfuscators: the codebase rubric total (0–CODEBASE_MAX). */
  codebase?: number;
  /** Whether the vendor publishes versions and changelogs; undefined when unknown. */
  disclosure?: Disclosure;
  now: Date;
}

export interface ScoreComponent {
  key: ComponentKey;
  label: string;
  weight: number;
  points: number;
  /** True when there was no data and the component received neutral half credit. */
  imputed: boolean;
  detail: string;
}

export interface Score {
  total: number;
  tier: Tier;
  confidence: number;
  provisional: boolean;
  /** Too little real data to rank; the total is computed but not presented as a rating. */
  unrated: boolean;
  /** True when the open-source cap lowered the total. */
  capped: boolean;
  /** Days into the proving period of the latest version, if it is in one. */
  provingDay?: number;
  /** True when that proving period runs from an observation start rather than a release. */
  observed?: boolean;
  components: ScoreComponent[];
}

function exposurePoints(v: VersionStatus): number {
  switch (v.exposure) {
    case 'open-source':
      return 0;
    case 'free':
      return 5;
    case 'paid':
    case 'private':
      return 30;
    default:
      return 5;
  }
}

export function resistancePoints(v: VersionStatus): number {
  if (v.status === 'holding') return 50;
  if (v.status === 'partial') return 20;
  return exposurePoints(v) + (v.difficulty ? DIFFICULTY_BONUS[v.difficulty] : 0);
}

/** Age in days of a holding version that is still inside its proving period. */
export function provingDay(v: VersionStatus, now: Date): number | undefined {
  const start = v.released ?? v.observedSince;
  if (v.status !== 'holding' || !start) return undefined;
  const age = Math.max(0, daysBetween(start, now));
  return age < PROVING_DAYS ? age : undefined;
}

const ARTICLE_ACCESS: Record<Access, string> = {
  'open-source': 'an open-source',
  free: 'a free',
  paid: 'a paid',
  private: 'a private',
};

function resistanceDetail(v: VersionStatus): string {
  if (v.status === 'holding') return 'Latest version: no public deobfuscator tracked.';
  if (v.status === 'partial') return 'Latest version: constants, bytecode or traces recoverable; no readable source.';
  const tool = v.exposure ? ARTICLE_ACCESS[v.exposure] : 'a';
  const effort = v.difficulty
    ? v.difficulty === 'easy'
      ? ' The break was easy.'
      : ` Even the easiest break was ${v.difficulty}, worth +${DIFFICULTY_BONUS[v.difficulty]}.`
    : '';
  return `Latest version: readable source recoverable with ${tool} tool.${effort}`;
}

/** Survival days of versions with a settled outcome (versions still proving are left out). */
export function settledSurvivals(versions: VersionStatus[], now: Date): { days: number[]; fuzzy: boolean } {
  const settled = versions.filter((v) => provingDay(v, now) === undefined);
  return {
    days: settled.map((v) => survivalDays(v, now)).filter((d): d is number => d !== undefined),
    fuzzy: settled.some((v) => v.fuzzy),
  };
}

export function techniquePoints(techniques: Technique[]): number {
  const unique = [...new Set(techniques)];
  const sum = unique.reduce((acc, t) => acc + TECHNIQUE_META[t].points, 0);
  return Math.min(WEIGHTS.technique, sum);
}

export function tierFor(total: number): Tier {
  return TIERS.find((t) => total >= t.min)!.tier;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function resistanceComponent(input: ScoreInput): { component: ScoreComponent; provingDay?: number } {
  const day = provingDay(input.latest, input.now);
  if (day === undefined) {
    return {
      component: {
        key: 'resistance',
        label: 'Resistance',
        weight: WEIGHTS.resistance,
        points: resistancePoints(input.latest),
        imputed: false,
        detail: resistanceDetail(input.latest),
      },
    };
  }
  const base = input.previous ? resistancePoints(input.previous) : PROVING_BASELINE;
  const points = round1(base + (WEIGHTS.resistance - base) * (day / PROVING_DAYS));
  const observed = !input.latest.released;
  return {
    provingDay: day,
    component: {
      key: 'resistance',
      label: 'Resistance',
      weight: WEIGHTS.resistance,
      points,
      imputed: false,
      detail: observed
        ? `No public deobfuscator found since luau.site started watching: day ${day} of ${PROVING_DAYS}, earning credit from ${base} toward ${WEIGHTS.resistance}.`
        : `Latest version is unbroken but new: day ${day} of a ${PROVING_DAYS}-day proving period, ramping from ${base} to ${WEIGHTS.resistance}.`,
    },
  };
}

function codebaseComponent(input: ScoreInput, rubric: number): ScoreComponent {
  const factor = OSS_STATUS_FACTOR[input.latest.status];
  const points = round1((rubric / CODEBASE_MAX) * WEIGHTS.codebase * factor);
  const why = factor < 1 ? `, ×${factor} because the latest version is ${input.latest.status}` : '';
  return {
    key: 'codebase',
    label: 'Codebase',
    weight: WEIGHTS.codebase,
    points,
    imputed: false,
    detail: `Open source, so it can't hold. Codebase graded ${rubric}/${CODEBASE_MAX}${why}.`,
  };
}

export function computeScore(input: ScoreInput): Score {
  const components: ScoreComponent[] = [];
  const openSource = input.codebase !== undefined;
  let day: number | undefined;

  if (openSource) {
    components.push(codebaseComponent(input, input.codebase!));
  } else {
    const r = resistanceComponent(input);
    day = r.provingDay;
    components.push(r.component);
  }

  if (!openSource) {
    // Versions still proving themselves say nothing yet about how long versions survive.
    const { days: survivals, fuzzy } = settledSurvivals(input.versions, input.now);
    const med = median(survivals);
    // A vendor that publishes nothing gets no benefit of the doubt for the missing history.
    const opaque = med === undefined && input.disclosure === 'none';
    components.push({
      key: 'track',
      label: 'Track record',
      weight: WEIGHTS.track,
      points: med !== undefined ? round1(WEIGHTS.track * Math.min(1, med / TRACK_FULL_DAYS)) : opaque ? 0 : WEIGHTS.track / 2,
      imputed: med === undefined && !opaque,
      detail:
        med !== undefined
          ? `Median survival ${formatDuration(med, fuzzy)} across ${survivals.length} version${survivals.length === 1 ? '' : 's'}.`
          : opaque
            ? 'The vendor publishes no versions or changelog, so there is no history to credit.'
            : 'No dated versions with a settled outcome yet — neutral half credit.',
    });
  }

  // Open source gets no benefit of the doubt: missing data earns nothing.
  const missing = (weight: number) => (openSource ? 0 : weight / 2);
  const missingNote = openSource ? 'no credit for open source' : 'neutral half credit';

  const lab = input.lab && input.lab.tested > 0 ? input.lab : undefined;
  components.push({
    key: 'lab',
    label: 'Lab results',
    weight: WEIGHTS.lab,
    points: lab ? round1(WEIGHTS.lab * (1 - lab.recovered / lab.tested)) : missing(WEIGHTS.lab),
    imputed: !lab,
    detail: lab
      ? `${lab.recovered} of ${lab.tested} benchmark samples recovered with matching behavior.`
      : `Not benchmarked in the Lab yet — ${missingNote}.`,
  });

  const known = input.techniques.length > 0;
  components.push({
    key: 'technique',
    label: 'Technique depth',
    weight: WEIGHTS.technique,
    points: known ? round1(techniquePoints(input.techniques)) : missing(WEIGHTS.technique),
    imputed: !known,
    detail: known
      ? `${input.techniques.length} documented technique${input.techniques.length === 1 ? '' : 's'}.`
      : `Techniques not documented yet — ${missingNote}.`,
  });

  const raw = Math.round(components.reduce((a, c) => a + c.points, 0));
  const total = openSource ? Math.min(OSS_CAP, raw) : raw;
  const weight = components.reduce((a, c) => a + c.weight, 0);
  const confidence = round2(components.filter((c) => !c.imputed).reduce((a, c) => a + c.weight, 0) / weight);

  // Anything in a proving period is rated: the ramp already keeps it from outranking proven projects.
  const unrated = confidence < UNRATED_BELOW && day === undefined;
  return {
    total,
    tier: tierFor(total),
    confidence,
    provisional: !unrated && confidence < PROVISIONAL_BELOW,
    unrated,
    capped: openSource && raw > OSS_CAP,
    provingDay: day,
    observed: day !== undefined && !input.latest.released,
    components,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ranking order: rated projects by score, unrated ones last. */
export function compareScores(a: Score, b: Score): number {
  return Number(a.unrated) - Number(b.unrated) || b.total - a.total;
}
