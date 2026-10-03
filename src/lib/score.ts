/**
 * The luau.site Security Score. A pure function of the dataset: if the data
 * changes, the score changes — nobody types a score by hand.
 *
 * Components without data (no dated versions, no Lab runs) get neutral half
 * credit instead of being re-normalized away — an absence of evidence should
 * neither inflate nor sink a score. `confidence` is the share of the weight
 * backed by real data; below PROVISIONAL_BELOW the score is shown as provisional.
 */
import { formatDuration } from './dates';
import { median, survivalDays, type VersionStatus } from './status';
import { TECHNIQUE_META, type Access, type Technique } from './taxonomy';

export const WEIGHTS = { resistance: 50, track: 20, lab: 20, technique: 10 } as const;
export type ComponentKey = keyof typeof WEIGHTS;

/** Scores backed by less than this share of real data are labelled provisional. */
export const PROVISIONAL_BELOW = 0.7;

/** Days of median survival that earn full track-record points. */
export const TRACK_FULL_DAYS = 365;

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
  versions: VersionStatus[];
  techniques: Technique[];
  lab?: LabSummary;
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
  components: ScoreComponent[];
}

export function resistancePoints(v: VersionStatus): number {
  if (v.status === 'holding') return 50;
  if (v.status === 'partial') return 20;
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

function resistanceDetail(v: VersionStatus): string {
  if (v.status === 'holding') return 'Latest version: no public deobfuscator tracked.';
  if (v.status === 'partial') return 'Latest version: constants, bytecode or traces recoverable; no readable source.';
  const tool = v.exposure ? ARTICLE_ACCESS[v.exposure] : 'a';
  return `Latest version: readable source recoverable with ${tool} tool.`;
}

const ARTICLE_ACCESS: Record<Access, string> = {
  'open-source': 'an open-source',
  free: 'a free',
  paid: 'a paid',
  private: 'a private',
};

export function techniquePoints(techniques: Technique[]): number {
  const unique = [...new Set(techniques)];
  const sum = unique.reduce((acc, t) => acc + TECHNIQUE_META[t].points, 0);
  return Math.min(WEIGHTS.technique, sum);
}

export function tierFor(total: number): Tier {
  return TIERS.find((t) => total >= t.min)!.tier;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeScore(input: ScoreInput): Score {
  const components: ScoreComponent[] = [];

  components.push({
    key: 'resistance',
    label: 'Resistance',
    weight: WEIGHTS.resistance,
    points: resistancePoints(input.latest),
    imputed: false,
    detail: resistanceDetail(input.latest),
  });

  const survivals = input.versions
    .map((v) => survivalDays(v, input.now))
    .filter((d): d is number => d !== undefined);
  const med = median(survivals);
  components.push({
    key: 'track',
    label: 'Track record',
    weight: WEIGHTS.track,
    points: med === undefined ? WEIGHTS.track / 2 : round1(WEIGHTS.track * Math.min(1, med / TRACK_FULL_DAYS)),
    imputed: med === undefined,
    detail:
      med === undefined
        ? 'No dated versions yet — neutral half credit.'
        : `Median survival ${formatDuration(med, input.versions.some((v) => v.fuzzy))} across ${survivals.length} version${survivals.length === 1 ? '' : 's'}.`,
  });

  const lab = input.lab && input.lab.tested > 0 ? input.lab : undefined;
  components.push({
    key: 'lab',
    label: 'Lab results',
    weight: WEIGHTS.lab,
    points: lab ? round1(WEIGHTS.lab * (1 - lab.recovered / lab.tested)) : WEIGHTS.lab / 2,
    imputed: !lab,
    detail: lab
      ? `${lab.recovered} of ${lab.tested} benchmark samples recovered with matching behavior.`
      : 'Not benchmarked in the Lab yet — neutral half credit.',
  });

  const tp = techniquePoints(input.techniques);
  components.push({
    key: 'technique',
    label: 'Technique depth',
    weight: WEIGHTS.technique,
    points: round1(tp),
    imputed: false,
    detail: `${input.techniques.length} documented technique${input.techniques.length === 1 ? '' : 's'}.`,
  });

  const total = Math.round(components.reduce((a, c) => a + c.points, 0));
  const confidence = components.filter((c) => !c.imputed).reduce((a, c) => a + c.weight, 0) / 100;

  return { total, tier: tierFor(total), confidence, provisional: confidence < PROVISIONAL_BELOW, components };
}
