import { describe, expect, it } from 'vitest';
import { collectHits, deriveVersionStatus, hitEffect, median, survivalDays, type DeobfuscatorLike } from '../src/lib/status';

const luraphDeob: DeobfuscatorLike = {
  id: 'deobfuscator-luraph-v15',
  access: 'open-source',
  outputLevel: 'near-original',
  firstSeen: '2026-09-02',
  targets: [
    { obfuscator: 'luraph', versions: ['15'], support: 'full' },
    { obfuscator: 'luraph', versions: ['14.7', '14.8', '14.9'], support: 'experimental' },
  ],
};

const paidDumper: DeobfuscatorLike = {
  id: 'paid-dumper',
  access: 'paid',
  outputLevel: 'constants',
  firstSeen: '2026-08-20',
  targets: [{ obfuscator: 'luraph', versions: ['15'], support: 'full' }],
};

describe('hitEffect', () => {
  it('only full support with readable output breaks a version', () => {
    expect(hitEffect('full', 'readable')).toBe('break');
    expect(hitEffect('full', 'near-original')).toBe('break');
    expect(hitEffect('experimental', 'near-original')).toBe('partial');
    expect(hitEffect('full', 'constants')).toBe('partial');
    expect(hitEffect('full', 'bytecode')).toBe('partial');
  });
});

describe('deriveVersionStatus', () => {
  it('marks Luraph v15 broken and computes time to break', () => {
    const hits = collectHits('luraph', '15', [luraphDeob, paidDumper]);
    expect(hits.map((h) => h.deobfuscator)).toEqual(['paid-dumper', 'deobfuscator-luraph-v15']);

    const s = deriveVersionStatus({ version: '15', released: '2026-08-12' }, hits);
    expect(s.status).toBe('broken');
    expect(s.brokenOn?.raw).toBe('2026-09-02');
    expect(s.daysToBreak).toBe(21);
    expect(s.exposure).toBe('open-source');
    expect(s.decisive.map((h) => h.deobfuscator)).toEqual(['deobfuscator-luraph-v15']);
    expect(s.fuzzy).toBe(false);
  });

  it('counts a public bytecode lifter as exposing a privately broken version', () => {
    const service: DeobfuscatorLike = {
      id: 'service',
      access: 'private',
      outputLevel: 'readable',
      firstSeen: '2024-01-01',
      targets: [{ obfuscator: 'moonsec', versions: ['3'], support: 'full' }],
    };
    const lifter: DeobfuscatorLike = {
      id: 'lifter',
      access: 'open-source',
      outputLevel: 'bytecode',
      firstSeen: '2025-11-15',
      targets: [{ obfuscator: 'moonsec', versions: ['3'], support: 'full' }],
    };
    const privateOnly = deriveVersionStatus({ version: '3' }, collectHits('moonsec', '3', [service]));
    expect(privateOnly.exposure).toBe('private');

    const both = deriveVersionStatus({ version: '3' }, collectHits('moonsec', '3', [service, lifter]));
    expect(both.status).toBe('broken');
    expect(both.exposure).toBe('open-source');
    expect(both.decisive.map((h) => h.deobfuscator)).toEqual(['service']);

    // A bytecode lifter on its own is still only partial coverage.
    const alone = deriveVersionStatus({ version: '3' }, collectHits('moonsec', '3', [lifter]));
    expect(alone.status).toBe('partial');
    expect(alone.exposure).toBeUndefined();
  });

  it('marks experimental coverage as partial', () => {
    const s = deriveVersionStatus({ version: '14.8' }, collectHits('luraph', '14.8', [luraphDeob]));
    expect(s.status).toBe('partial');
    expect(s.brokenOn).toBeUndefined();
    expect(s.daysToBreak).toBeUndefined();
  });

  it('is holding with no coverage', () => {
    const s = deriveVersionStatus({ version: '1.0', released: '2026-01-01' }, []);
    expect(s.status).toBe('holding');
    expect(s.decisive).toEqual([]);
  });

  it('flags fuzzy time-to-break for approximate dates', () => {
    const s = deriveVersionStatus({ version: '15', released: '~2026-08' }, collectHits('luraph', '15', [luraphDeob]));
    expect(s.fuzzy).toBe(true);
  });

  it('honours a manual override', () => {
    const s = deriveVersionStatus({ version: '14.7', status: 'broken', statusNote: 'Confirmed privately' }, []);
    expect(s.status).toBe('broken');
    expect(s.overridden).toBe(true);
    expect(s.manual).toBe(true);
    expect(s.brokenOn).toBeUndefined();
  });

  it('dates a manual break and takes its exposure from breakAccess', () => {
    const s = deriveVersionStatus(
      { version: 'May builds', released: '2026-05-18', status: 'broken', statusNote: 'Sample-specific', brokenOn: '2026-06-13', breakAccess: 'private' },
      [],
    );
    expect(s.manual).toBe(true);
    expect(s.brokenOn?.raw).toBe('2026-06-13');
    expect(s.daysToBreak).toBe(26);
    expect(s.exposure).toBe('private');
    expect(s.decisive).toEqual([]);
  });

  it('prefers a real tool break over a manual date', () => {
    const s = deriveVersionStatus(
      { version: '15', released: '2026-08-12', status: 'broken', statusNote: 'Also seen privately', brokenOn: '2026-08-20', breakAccess: 'private' },
      collectHits('luraph', '15', [luraphDeob]),
    );
    expect(s.manual).toBe(false);
    expect(s.brokenOn?.raw).toBe('2026-09-02');
    expect(s.exposure).toBe('open-source');
  });

  it('uses per-target since dates when present', () => {
    const late: DeobfuscatorLike = {
      ...luraphDeob,
      targets: [{ obfuscator: 'luraph', versions: ['15'], support: 'full', since: '2026-09-20' }],
    };
    const s = deriveVersionStatus({ version: '15', released: '2026-08-12' }, collectHits('luraph', '15', [late]));
    expect(s.brokenOn?.raw).toBe('2026-09-20');
  });
});

describe('survival', () => {
  const now = new Date('2026-10-03T00:00:00Z');
  it('uses time to break for broken versions and age for holding ones', () => {
    const broken = deriveVersionStatus({ version: '15', released: '2026-08-12' }, collectHits('luraph', '15', [luraphDeob]));
    const holding = deriveVersionStatus({ version: '2', released: '2026-04-06' }, []);
    expect(survivalDays(broken, now)).toBe(21);
    expect(survivalDays(holding, now)).toBe(180);
    expect(survivalDays(deriveVersionStatus({ version: 'x' }, []), now)).toBeUndefined();
  });

  it('computes medians', () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('unknown coverage dates', () => {
  it('keeps the status but does not invent a break date', () => {
    const d: DeobfuscatorLike = {
      id: 'late-claim',
      access: 'open-source',
      outputLevel: 'readable',
      firstSeen: '2026-07-31',
      targets: [{ obfuscator: 'moonveil', versions: ['1.4.5'], support: 'full', since: 'unknown' }],
    };
    const s = deriveVersionStatus({ version: '1.4.5' }, collectHits('moonveil', '1.4.5', [d]));
    expect(s.status).toBe('broken');
    expect(s.brokenOn).toBeUndefined();
  });
});
