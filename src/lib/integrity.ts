/**
 * Cross-file checks the schemas can't express on their own. Used by the build
 * (so a bad reference fails `astro build`) and by `pnpm validate`.
 */

export interface IntegrityInput {
  obfuscators: { id: string; versions: { version: string }[]; basedOn?: string }[];
  deobfuscators: { id: string; targets: { obfuscator: string; versions: string[] }[] }[];
  labRuns?: { sample: string; obfuscator: string; version: string; deob: { deobfuscator: string }[] }[];
}

export function checkIntegrity({ obfuscators, deobfuscators, labRuns = [] }: IntegrityInput): string[] {
  const errors: string[] = [];
  const versions = new Map<string, Set<string>>();

  for (const o of obfuscators) {
    const seen = new Set<string>();
    for (const v of o.versions) {
      if (seen.has(v.version)) errors.push(`obfuscators/${o.id}: version "${v.version}" is listed twice`);
      seen.add(v.version);
    }
    versions.set(o.id, seen);
  }

  // Lineage: every parent must exist, and following parents must never loop back.
  const parent = new Map(obfuscators.filter((o) => o.basedOn).map((o) => [o.id, o.basedOn!]));
  for (const [id, base] of parent) {
    if (!versions.has(base)) {
      errors.push(`obfuscators/${id}: basedOn unknown obfuscator "${base}"`);
      continue;
    }
    const chain = [id];
    for (let at: string | undefined = base; at; at = parent.get(at)) {
      if (chain.includes(at)) {
        errors.push(`obfuscators/${id}: basedOn forms a cycle (${[...chain, at].join(' → ')})`);
        break;
      }
      chain.push(at);
    }
  }

  const deobIds = new Set(deobfuscators.map((d) => d.id));
  for (const d of deobfuscators) {
    for (const t of d.targets) {
      const known = versions.get(t.obfuscator);
      if (!known) {
        errors.push(`deobfuscators/${d.id}: unknown obfuscator "${t.obfuscator}"`);
        continue;
      }
      for (const v of t.versions) {
        if (!known.has(v)) {
          errors.push(
            `deobfuscators/${d.id}: ${t.obfuscator} has no version "${v}" (known: ${[...known].join(', ')})`,
          );
        }
      }
    }
  }

  for (const r of labRuns) {
    const known = versions.get(r.obfuscator);
    if (!known) errors.push(`lab/runs/${r.sample}: unknown obfuscator "${r.obfuscator}"`);
    else if (!known.has(r.version)) errors.push(`lab/runs/${r.sample}: ${r.obfuscator} has no version "${r.version}"`);
    for (const d of r.deob) {
      if (!deobIds.has(d.deobfuscator)) errors.push(`lab/runs/${r.sample}: unknown deobfuscator "${d.deobfuscator}"`);
    }
  }

  return errors;
}
