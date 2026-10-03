import type { APIRoute } from 'astro';
import { formatVersion, getSiteData } from '~/lib/data';
import { NAV } from '~/lib/site';
import { DEOB_TECHNIQUES, DEOB_TECHNIQUE_META, STATUS_META, TECHNIQUES, TECHNIQUE_META } from '~/lib/taxonomy';

export const GET: APIRoute = async () => {
  const { obfuscators, deobfuscators, auth, samples } = await getSiteData();
  const anchor = (v: string) => `v-${v.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  const entries = [
    ...NAV.map((n) => ({ kind: 'Page', title: n.label, subtitle: `luau.site${n.href}`, href: n.href })),
    { kind: 'Page', title: 'Methodology', subtitle: 'How statuses and scores are computed', href: '/methodology' },
    { kind: 'Page', title: 'Submit & correct', subtitle: 'Add or fix data with a source', href: '/submit' },
    ...obfuscators.map((o) => ({
      kind: 'Obfuscator',
      title: o.data.name,
      subtitle: `${formatVersion(o.latest.version)} · ${STATUS_META[o.status].label} · ${o.score.unrated ? 'unrated' : `score ${o.score.total}`}`,
      href: `/obfuscators/${o.id}`,
      keywords: [o.data.vendor, o.data.tagline].filter(Boolean).join(' '),
    })),
    ...obfuscators.flatMap((o) =>
      o.versions.map((v) => ({
        kind: 'Version',
        title: `${o.data.name} ${formatVersion(v.version)}`,
        subtitle: STATUS_META[v.s.status].label,
        href: `/obfuscators/${o.id}#${anchor(v.version)}`,
      })),
    ),
    ...deobfuscators.map((d) => ({
      kind: 'Deobfuscator',
      title: d.data.name,
      subtitle: `by ${d.data.author} · targets ${[...new Set(d.coverage.map((c) => c.obfuscatorName))].join(', ')}`,
      href: `/deobfuscators/${d.id}`,
      keywords: d.data.tagline,
    })),
    ...obfuscators.flatMap((o) =>
      o.data.challenges.map((c) => ({
        kind: 'Challenge',
        title: `${c.title} (${o.data.name})`,
        subtitle: `${c.platform} · ${c.status === 'open' ? 'unsolved' : 'solved'}${c.bounty ? ` · ${c.bounty} bounty` : ''}`,
        href: `/obfuscators/${o.id}#challenges`,
        keywords: 'crackme bounty challenge',
      })),
    ),
    ...auth.map((a) => ({ kind: 'Auth', title: a.data.name, subtitle: a.data.tagline, href: `/auth/${a.id}` })),
    ...samples.map((s) => ({ kind: 'Lab', title: s.meta.title, subtitle: s.meta.description, href: `/lab/${s.id}` })),
    ...TECHNIQUES.map((t) => ({ kind: 'Term', title: TECHNIQUE_META[t].label, subtitle: TECHNIQUE_META[t].description, href: `/learn#${t}` })),
    ...DEOB_TECHNIQUES.map((t) => ({
      kind: 'Term',
      title: DEOB_TECHNIQUE_META[t].label,
      subtitle: DEOB_TECHNIQUE_META[t].description,
      href: `/learn#${t}`,
    })),
  ];
  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } });
};
