import { describe, expect, it } from 'vitest';
import { compareScores, computeScore, OSS_CAP, provingDay, resistancePoints, techniquePoints, tierFor } from '../src/lib/score';
import { collectHits, deriveVersionStatus, type DeobfuscatorLike } from '../src/lib/status';

const now = new Date('2026-10-03T00:00:00Z');
const tool = (access: DeobfuscatorLike['access'], outputLevel: DeobfuscatorLike['outputLevel'] = 'readable'): DeobfuscatorLike => ({
  id: `t-${access}-${outputLevel}`,
  access,
  outputLevel,
  firstSeen: '2026-09-01',
  targets: [{ obfuscator: 'x', versions: ['1'], support: 'full' }],
});
const status = (...tools: DeobfuscatorLike[]) =>
  deriveVersionStatus({ version: '1', released: '2026-06-01' }, collectHits('x', '1', tools));

describe('resistance', () => {
  it('ranks exposure from holding down to open-source breaks', () => {
    expect(resistancePoints(status())).toBe(50);
    expect(resistancePoints(status(tool('private')))).toBe(30);
    expect(resistancePoints(status(tool('paid')))).toBe(30);
    expect(resistancePoints(status(tool('free', 'constants')))).toBe(20);
    expect(resistancePoints(status(tool('free')))).toBe(5);
    expect(resistancePoints(status(tool('open-source')))).toBe(0);
  });

  it('takes the most exposed tool when several break a version', () => {
    expect(resistancePoints(status(tool('paid'), tool('open-source')))).toBe(0);
  });
});

describe('technique depth', () => {
  it('sums points, ignores duplicates and caps at 10', () => {
    expect(techniquePoints(['vm', 'vm'])).toBe(3);
    expect(techniquePoints(['compression', 'watermarking'])).toBe(0);
    expect(
      techniquePoints(['vm', 'nested-vm', 'polymorphic-vm', 'const-encryption', 'string-encryption', 'cff', 'anti-tamper', 'env-checks']),
    ).toBe(10);
  });
});

describe('computeScore', () => {
  it('gives missing components neutral half credit and marks the score provisional', () => {
    const latest = deriveVersionStatus({ version: 'main' }, []);
    const s = computeScore({ latest, versions: [latest], techniques: ['vm'], now });
    // resistance 50 + track 10 (imputed) + lab 10 (imputed) + technique 3
    expect(s.total).toBe(73);
    expect(s.confidence).toBe(0.6);
    expect(s.provisional).toBe(true);
    expect(s.components.filter((c) => c.imputed).map((c) => c.key)).toEqual(['track', 'lab']);
  });

  it('never ranks an undocumented obfuscator above one with a proven record', () => {
    const unknown = deriveVersionStatus({ version: 'main' }, []);
    const proven = deriveVersionStatus({ version: '1', released: '2023-01-01' }, []);
    const a = computeScore({ latest: unknown, versions: [unknown], techniques: ['vm'], now });
    const b = computeScore({ latest: proven, versions: [proven], techniques: ['vm'], now, lab: { tested: 3, recovered: 0 } });
    expect(b.total).toBeGreaterThan(a.total);
    expect(b.provisional).toBe(false);
  });

  it('scores a quickly broken, open-source-cracked obfuscator low', () => {
    const latest = status(tool('open-source'));
    const s = computeScore({ latest, versions: [latest], techniques: ['vm', 'cff'], now, lab: { tested: 4, recovered: 4 } });
    // resistance 0, track 20*(92/365)=5.0, lab 0, technique 4
    expect(s.components.map((c) => c.points)).toEqual([0, 5, 0, 4]);
    expect(s.total).toBe(9);
    expect(s.tier).toBe('F');
    expect(s.confidence).toBe(1);
    expect(s.provisional).toBe(false);
  });

  it('caps track record at a year of median survival', () => {
    const old = deriveVersionStatus({ version: '1', released: '2020-01-01' }, []);
    const s = computeScore({ latest: old, versions: [old], techniques: [], now });
    expect(s.components.find((c) => c.key === 'track')!.points).toBe(20);
  });
});

describe('tiers', () => {
  it('maps totals to tiers', () => {
    expect(tierFor(100)).toBe('S');
    expect(tierFor(85)).toBe('S');
    expect(tierFor(84)).toBe('A');
    expect(tierFor(55)).toBe('B');
    expect(tierFor(40)).toBe('C');
    expect(tierFor(39)).toBe('F');
  });
});

describe('open source', () => {
  const holding = deriveVersionStatus({ version: 'main' }, []);

  it('replaces resistance and track record with a codebase grade and gives no benefit of the doubt', () => {
    const s = computeScore({ latest: holding, versions: [holding], techniques: ['vm'], codebase: 10, now });
    expect(s.components.map((c) => c.key)).toEqual(['codebase', 'lab', 'technique']);
    // codebase 10/20 × 40 = 20, missing lab earns 0, technique 3
    expect(s.components.map((c) => c.points)).toEqual([20, 0, 3]);
    expect(s.total).toBe(23);
    expect(s.confidence).toBe(0.71);
    expect(s.unrated).toBe(false);
  });

  it('halves the codebase grade once the latest version is broken', () => {
    const broken = status(tool('open-source'));
    const s = computeScore({ latest: broken, versions: [broken], techniques: [], codebase: 10, now });
    expect(s.components[0]!.points).toBe(10);
  });

  it('is capped at OSS_CAP', () => {
    const s = computeScore({ latest: holding, versions: [holding], techniques: ['vm', 'nested-vm', 'polymorphic-vm', 'cff', 'anti-tamper', 'env-checks'], codebase: 20, lab: { tested: 3, recovered: 0 }, now });
    expect(s.total).toBe(OSS_CAP);
    expect(s.capped).toBe(true);
  });

  it('lets a really good open-source project beat a broken closed-source one, but not an average one', () => {
    const closed = status(tool('open-source'));
    const brokenClosed = computeScore({ latest: closed, versions: [closed], techniques: ['vm', 'polymorphic-vm', 'cff'], now });
    const great = computeScore({ latest: holding, versions: [holding], techniques: ['vm', 'cff', 'anti-tamper'], codebase: 18, now });
    const average = computeScore({ latest: holding, versions: [holding], techniques: ['vm', 'cff'], codebase: 8, now });
    expect(great.total).toBeGreaterThan(brokenClosed.total);
    expect(average.total).toBeLessThanOrEqual(brokenClosed.total);
  });
});

describe('proving period', () => {
  const brokenPrev = deriveVersionStatus(
    { version: '15', released: '2026-08-12' },
    collectHits('x', '15', [{ ...tool('open-source'), targets: [{ obfuscator: 'x', versions: ['15'], support: 'full' }] }]),
  );
  const fresh = deriveVersionStatus({ version: '15.1', released: '2026-10-02' }, []);

  it('ramps resistance from the predecessor level, so a day-old release adds only slightly', () => {
    expect(provingDay(fresh, now)).toBe(1);
    const s = computeScore({ latest: fresh, previous: brokenPrev, versions: [brokenPrev, fresh], techniques: ['vm'], now });
    expect(s.components[0]!.points).toBe(0.6);
    expect(s.provingDay).toBe(1);
  });

  it('starts a first-ever release from the neutral baseline', () => {
    const s = computeScore({ latest: fresh, versions: [fresh], techniques: ['vm'], now });
    expect(s.components[0]!.points).toBe(25.3);
  });

  it('reaches full resistance after the proving period', () => {
    const old = deriveVersionStatus({ version: '15.1', released: '2026-06-01' }, []);
    expect(provingDay(old, now)).toBeUndefined();
    const s = computeScore({ latest: old, previous: brokenPrev, versions: [brokenPrev, old], techniques: [], now });
    expect(s.components[0]!.points).toBe(50);
  });

  it('keeps proving versions out of the track record', () => {
    const s = computeScore({ latest: fresh, previous: brokenPrev, versions: [brokenPrev, fresh], techniques: ['vm'], now });
    const track = s.components.find((c) => c.key === 'track')!;
    expect(track.detail).toMatch(/across 1 version\b/);
  });
});

describe('unrated and ordering', () => {
  it('marks scores with almost no real data as unrated, not provisional', () => {
    const v = deriveVersionStatus({ version: 'current' }, []);
    const s = computeScore({ latest: v, versions: [v], techniques: [], now });
    expect(s.components.find((c) => c.key === 'technique')!.imputed).toBe(true);
    expect(s.confidence).toBe(0.5);
    expect(s.unrated).toBe(true);
    expect(s.provisional).toBe(false);
  });

  it('ranks unrated projects last regardless of their total', () => {
    const v = deriveVersionStatus({ version: 'current' }, []);
    const unrated = computeScore({ latest: v, versions: [v], techniques: [], now });
    const low = computeScore({ latest: status(tool('open-source')), versions: [status(tool('open-source'))], techniques: ['vm'], now });
    expect(unrated.total).toBeGreaterThan(low.total);
    expect([unrated, low].sort(compareScores)[0]).toBe(low);
  });
});
