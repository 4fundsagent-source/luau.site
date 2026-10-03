/** Plain-JSON projections of the site data for /api/*.json. */
import type { SiteData } from './data';

const v = (x: { raw: string } | undefined) => x?.raw ?? null;

export function apiCollections(data: SiteData) {
  const obfuscators = data.obfuscators.map((o) => ({
    id: o.id,
    url: `/obfuscators/${o.id}`,
    name: o.data.name,
    vendor: o.data.vendor ?? null,
    basedOn: o.basedOn ?? null,
    derivatives: o.derivatives,
    tagline: o.data.tagline,
    pricing: o.data.pricing,
    license: o.data.license ?? null,
    targets: o.data.targets,
    techniques: o.data.techniques,
    links: { website: o.data.website ?? null, repo: o.data.repo ?? null, docs: o.data.docs ?? null, discord: o.data.discord ?? null },
    status: o.status,
    openSource: o.openSource,
    availability: o.data.availability,
    beta: o.data.beta,
    disclosure: o.data.disclosure ?? null,
    observedSince: o.observedSince?.raw ?? null,
    challenges: o.data.challenges,
    codebase: o.data.codebase ? { ...o.data.codebase, total: o.codebase ?? null } : null,
    score: {
      total: o.score.unrated ? null : o.score.total,
      tier: o.score.unrated ? null : o.score.tier,
      confidence: o.score.confidence,
      provisional: o.score.provisional,
      unrated: o.score.unrated,
      capped: o.score.capped,
      provingDay: o.score.provingDay ?? null,
      earningCredit: o.score.observed ?? false,
      components: o.score.components.map(({ key, points, weight, imputed }) => ({ key, points, weight, imputed })),
    },
    versions: o.versions.map((ver) => ({
      version: ver.version,
      latest: ver.isLatest,
      provingDay: ver.provingDay ?? null,
      released: v(ver.s.released),
      status: ver.s.status,
      brokenOn: v(ver.s.brokenOn),
      daysToBreak: ver.s.daysToBreak ?? null,
      approximate: ver.s.fuzzy,
      breakDifficulty: ver.s.difficulty ?? null,
      deobfuscators: ver.s.hits.map((h) => ({ id: h.deobfuscator, effect: h.effect, support: h.support, difficulty: h.difficulty ?? null, date: v(h.date) })),
    })),
    verified: o.data.verified,
    lastVerified: o.data.lastVerified,
    sources: o.data.sources,
  }));

  const deobfuscators = data.deobfuscators.map((d) => ({
    id: d.id,
    url: `/deobfuscators/${d.id}`,
    name: d.data.name,
    author: d.data.author,
    tagline: d.data.tagline,
    access: d.data.access,
    license: d.data.license ?? null,
    techniques: d.data.techniques,
    outputLevel: d.data.outputLevel,
    maintenance: d.data.maintenance,
    firstSeen: v(d.firstSeen),
    links: { website: d.data.website ?? null, repo: d.data.repo ?? null },
    coverage: d.coverage.map(({ obfuscator, version, support, effect }) => ({ obfuscator, version, support, effect })),
    verified: d.data.verified,
    lastVerified: d.data.lastVerified,
    sources: d.data.sources,
  }));

  const auth = data.auth.map((a) => ({
    id: a.id,
    url: `/auth/${a.id}`,
    name: a.data.name,
    tagline: a.data.tagline,
    pricing: a.data.pricing,
    features: a.data.features,
    bundledObfuscator: a.data.bundledObfuscator?.id ?? null,
    bypass: a.data.bypass,
    protection: a.data.protection ?? null,
    verified: a.data.verified,
    lastVerified: a.data.lastVerified,
    sources: a.data.sources,
  }));

  const events = data.events.map((e) => ({
    id: e.id,
    date: e.date.raw,
    kind: e.kind,
    title: e.title,
    summary: e.summary ?? null,
    url: e.href ?? null,
    obfuscator: e.obfuscator ?? null,
    deobfuscator: e.deobfuscator ?? null,
    sources: e.sources,
  }));

  const lab = data.samples.map((s) => ({
    id: s.id,
    url: `/lab/${s.id}`,
    title: s.meta.title,
    exercises: s.meta.exercises,
    bytes: s.bytes,
    verified: s.result?.ok ?? null,
    runs: s.runs.map((r) => ({
      id: r.id,
      obfuscator: r.obfuscator,
      version: r.version,
      bytes: r.bytes,
      behaves: r.result?.ok ?? null,
      deob: r.deob.map((d) => ({ id: d.id, deobfuscator: d.deobfuscator, version: d.version, recovered: d.result?.ok ?? null })),
    })),
  }));

  return { obfuscators, deobfuscators, auth, events, lab };
}

export const API_COLLECTIONS = ['obfuscators', 'deobfuscators', 'auth', 'events', 'lab'] as const;
