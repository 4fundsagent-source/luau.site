/**
 * Deobfuscator Score: how much a public tool matters to the scene today.
 *
 * Impact (70) comes from the most relevant thing the tool breaks: a current
 * commercial obfuscator's latest version counts fully, a version superseded in the
 * last 90 days a little less, and open-source or legacy targets barely at all.
 * Craft (30) — output quality, upkeep and availability — is scaled by that same
 * relevance, so a polished tool for a dead obfuscator still ranks low. Decompilers
 * break nothing on their own and get a flat, low relevance.
 */
import { daysBetween, type PartialDate } from './dates';
import { tierFor, type Tier } from './score';
import type { Access, DeobKind, Difficulty, Maintenance, OutputLevel, Segment } from './taxonomy';

export const DEOB_WEIGHTS = { impact: 70, craft: 30 } as const;

export const SEGMENT_WEIGHT: Record<Segment, number> = { current: 1, legacy: 0.2 };
/** Relevance of a decompiler, which targets bytecode rather than any obfuscator. */
export const DECOMPILER_RELEVANCE = 0.3;
export const VERSION_WEIGHT = { latest: 1, recent: 0.85, older: 0.5 } as const;
/** A version superseded this recently still counts as nearly current. */
export const RECENT_DAYS = 90;
export const EFFECT_WEIGHT = { break: 1, partial: 0.45 } as const;
export const DIFFICULTY_WEIGHT: Record<Difficulty | 'unknown', number> = { hard: 1, moderate: 0.85, unknown: 0.8, easy: 0.7 };
export const OUTPUT_WEIGHT: Record<OutputLevel, number> = { 'near-original': 1, readable: 0.8, bytecode: 0.4, constants: 0.2 };
export const UPKEEP_WEIGHT: Record<Maintenance, number> = { active: 1, stale: 0.4, archived: 0.15, patched: 0 };
export const ACCESS_WEIGHT: Record<Access, number> = { 'open-source': 1, free: 0.8, paid: 0.5, private: 0.2 };

export interface DeobCoverageInput {
  obfuscator: string;
  version: string;
  segment: Segment;
  /** Is this the obfuscator's current version? */
  latest: boolean;
  /** When the next version replaced this one, if it has been replaced and the date is known. */
  supersededOn?: PartialDate;
  effect: 'break' | 'partial';
  difficulty?: Difficulty;
}

export interface DeobScoreInput {
  kind: DeobKind;
  access: Access;
  outputLevel: OutputLevel;
  maintenance: Maintenance;
  coverage: DeobCoverageInput[];
  now: Date;
}

export interface DeobScore {
  total: number;
  tier: Tier;
  impact: number;
  craft: number;
  /** Relevance of the best target, 0–1. */
  relevance: number;
  /** The coverage entry that set the impact, if any. */
  best?: DeobCoverageInput;
}

export function versionWeight(c: Pick<DeobCoverageInput, 'latest' | 'supersededOn'>, now: Date): number {
  if (c.latest) return VERSION_WEIGHT.latest;
  if (c.supersededOn && daysBetween(c.supersededOn, now) <= RECENT_DAYS) return VERSION_WEIGHT.recent;
  return VERSION_WEIGHT.older;
}

export function relevanceOf(c: DeobCoverageInput, now: Date): number {
  return SEGMENT_WEIGHT[c.segment] * versionWeight(c, now);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeDeobScore(input: DeobScoreInput): DeobScore {
  let impactShare = 0;
  let relevance = 0;
  let best: DeobCoverageInput | undefined;

  if (input.kind === 'decompiler') {
    relevance = DECOMPILER_RELEVANCE;
    impactShare = DECOMPILER_RELEVANCE * DIFFICULTY_WEIGHT.unknown;
  } else {
    for (const c of input.coverage) {
      const r = relevanceOf(c, input.now);
      const share = r * EFFECT_WEIGHT[c.effect] * DIFFICULTY_WEIGHT[c.difficulty ?? 'unknown'];
      relevance = Math.max(relevance, r);
      // On a tie the later entry wins, so the newest of equally relevant versions is named.
      if (share > 0 && share >= impactShare) {
        impactShare = share;
        best = c;
      }
    }
  }

  const craftShare =
    0.5 * OUTPUT_WEIGHT[input.outputLevel] + 0.3 * UPKEEP_WEIGHT[input.maintenance] + 0.2 * ACCESS_WEIGHT[input.access];
  const impact = round1(DEOB_WEIGHTS.impact * impactShare);
  const craft = round1(DEOB_WEIGHTS.craft * relevance * craftShare);
  const total = Math.round(impact + craft);
  return { total, tier: tierFor(total), impact, craft, relevance, best };
}
