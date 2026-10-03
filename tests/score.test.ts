import { describe, expect, it } from 'vitest';
import { computeScore, resistancePoints, techniquePoints, tierFor } from '../src/lib/score';
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
