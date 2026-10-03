import { describe, expect, it } from 'vitest';
import { repoKey } from '../src/lib/github';

describe('repoKey', () => {
  it('normalizes GitHub repository URLs', () => {
    expect(repoKey('https://github.com/caomod2077/Deobfuscator-Luraph-V15')).toBe('caomod2077/deobfuscator-luraph-v15');
    expect(repoKey('https://github.com/prometheus-lua/Prometheus.git')).toBe('prometheus-lua/prometheus');
    expect(repoKey('https://github.com/Luraph/macrosdk/tree/main/src')).toBe('luraph/macrosdk');
  });

  it('ignores non-repository URLs', () => {
    expect(repoKey('https://github.com/Luraph')).toBeUndefined();
    expect(repoKey('https://git.openpunk.com/CPunch/MoonVeil-Docs')).toBeUndefined();
    expect(repoKey(undefined)).toBeUndefined();
  });
});
