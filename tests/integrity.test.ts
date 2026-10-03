import { describe, expect, it } from 'vitest';
import { checkIntegrity } from '../src/lib/integrity';

describe('checkIntegrity', () => {
  const obfuscators = [{ id: 'luraph', versions: [{ version: '14.9' }, { version: '15' }] }];

  it('passes on consistent data', () => {
    expect(
      checkIntegrity({
        obfuscators,
        deobfuscators: [{ id: 'd', targets: [{ obfuscator: 'luraph', versions: ['15'] }] }],
        labRuns: [{ sample: 'hello', obfuscator: 'luraph', version: '15', deob: [{ deobfuscator: 'd' }] }],
      }),
    ).toEqual([]);
  });

  it('reports unknown versions, obfuscators and duplicate versions', () => {
    const errors = checkIntegrity({
      obfuscators: [...obfuscators, { id: 'dup', versions: [{ version: '1' }, { version: '1' }] }],
      deobfuscators: [
        { id: 'd', targets: [{ obfuscator: 'luraph', versions: ['16'] }, { obfuscator: 'nope', versions: ['1'] }] },
      ],
      labRuns: [{ sample: 'hello', obfuscator: 'luraph', version: '15', deob: [{ deobfuscator: 'ghost' }] }],
    });
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/version "1" is listed twice/);
    expect(errors.join('\n')).toMatch(/no version "16"/);
    expect(errors.join('\n')).toMatch(/unknown obfuscator "nope"/);
    expect(errors.join('\n')).toMatch(/unknown deobfuscator "ghost"/);
  });

  it('reports unknown and cyclic lineage', () => {
    const errors = checkIntegrity({
      obfuscators: [
        { id: 'base', versions: [{ version: '1' }] },
        { id: 'fork', versions: [{ version: '1' }], basedOn: 'base' },
        { id: 'orphan', versions: [{ version: '1' }], basedOn: 'ghost' },
        { id: 'self', versions: [{ version: '1' }], basedOn: 'self' },
        { id: 'a', versions: [{ version: '1' }], basedOn: 'b' },
        { id: 'b', versions: [{ version: '1' }], basedOn: 'a' },
      ],
      deobfuscators: [],
    });
    expect(errors.join('\n')).toMatch(/orphan: basedOn unknown obfuscator "ghost"/);
    expect(errors.join('\n')).toMatch(/self: basedOn forms a cycle \(self → self\)/);
    expect(errors.join('\n')).toMatch(/a: basedOn forms a cycle \(a → b → a\)/);
    expect(errors.join('\n')).not.toMatch(/fork/);
  });
});
