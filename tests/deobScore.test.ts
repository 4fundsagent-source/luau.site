import { describe, expect, it } from 'vitest';
import { parseDate } from '../src/lib/dates';
import { computeDeobScore, ENV_LOGGER_RELEVANCE, versionWeight, VERSION_WEIGHT, type DeobScoreInput } from '../src/lib/deobScore';
import { segmentOf } from '../src/lib/taxonomy';

const now = new Date(Date.UTC(2026, 9, 4));
const base: Omit<DeobScoreInput, 'coverage' | 'kind'> = {
  access: 'open-source',
  outputLevel: 'readable',
  maintenance: 'active',
  now,
};

describe('computeDeobScore', () => {
  const v15Tool = computeDeobScore({
    ...base,
    kind: 'deobfuscator',
    outputLevel: 'near-original',
    coverage: [
      // Luraph v15, replaced by v15.1 two days ago.
      { obfuscator: 'luraph', version: '15', segment: 'current', latest: false, supersededOn: parseDate('2026-10-02'), effect: 'break', difficulty: 'hard' },
    ],
  });
  const easyCurrent = computeDeobScore({
    ...base,
    kind: 'deobfuscator',
    coverage: [{ obfuscator: 'moonveil', version: '1.4.5', segment: 'current', latest: true, effect: 'break', difficulty: 'easy' }],
  });
  const decompiler = computeDeobScore({ ...base, kind: 'decompiler', coverage: [] });
  const legacyOnly = computeDeobScore({
    ...base,
    kind: 'deobfuscator',
    outputLevel: 'near-original',
    coverage: [{ obfuscator: 'ironbrew-2', version: '2.7.1', segment: 'legacy', latest: true, effect: 'break' }],
  });

  it('ranks a hard break of a current commercial obfuscator first and legacy-only tools last', () => {
    expect(v15Tool.total).toBeGreaterThan(easyCurrent.total);
    expect(easyCurrent.total).toBeGreaterThan(decompiler.total);
    expect(decompiler.total).toBeGreaterThan(legacyOnly.total);
    expect(legacyOnly.total).toBeLessThan(20);
  });

  it('scales craft by relevance so polish cannot rescue a legacy tool', () => {
    expect(legacyOnly.craft).toBeLessThan(v15Tool.craft / 4);
  });

  it('names the most relevant covered version', () => {
    expect(v15Tool.best?.version).toBe('15');
    expect(decompiler.best).toBeUndefined();
  });

  it('counts partial coverage for less than a break', () => {
    const partial = computeDeobScore({
      ...base,
      kind: 'deobfuscator',
      coverage: [{ obfuscator: 'moonveil', version: '1.4.5', segment: 'current', latest: true, effect: 'partial', difficulty: 'easy' }],
    });
    expect(partial.impact).toBeLessThan(easyCurrent.impact);
  });

  const envLogger = (access: DeobScoreInput['access']) =>
    computeDeobScore({ ...base, kind: 'env-logger', access, outputLevel: 'constants', coverage: [] });

  it('gives env loggers a flat relevance and no named target', () => {
    const free = envLogger('free');
    expect(free.relevance).toBe(ENV_LOGGER_RELEVANCE);
    expect(free.best).toBeUndefined();
  });

  it('ranks a paid env logger below a free one, and both below a real break', () => {
    expect(envLogger('paid').total).toBeLessThan(envLogger('free').total);
    expect(envLogger('free').total).toBeLessThan(easyCurrent.total);
  });
});

describe('versionWeight', () => {
  it('treats a version replaced in the last 90 days as nearly current', () => {
    expect(versionWeight({ latest: true }, now)).toBe(VERSION_WEIGHT.latest);
    expect(versionWeight({ latest: false, supersededOn: parseDate('2026-08-01') }, now)).toBe(VERSION_WEIGHT.recent);
    expect(versionWeight({ latest: false, supersededOn: parseDate('2026-01-01') }, now)).toBe(VERSION_WEIGHT.older);
    expect(versionWeight({ latest: false }, now)).toBe(VERSION_WEIGHT.older);
  });
});

describe('segmentOf', () => {
  it('defaults open-source and discontinued entries to legacy', () => {
    expect(segmentOf({ pricing: 'paid' })).toBe('current');
    expect(segmentOf({ pricing: 'open-source' })).toBe('legacy');
    expect(segmentOf({ pricing: 'paid', discontinued: true })).toBe('legacy');
    expect(segmentOf({ pricing: 'unknown', segment: 'legacy' })).toBe('legacy');
    expect(segmentOf({ pricing: 'open-source', segment: 'current' })).toBe('current');
  });
});
