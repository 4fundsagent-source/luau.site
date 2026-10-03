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
});
