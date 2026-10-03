import type { APIRoute, GetStaticPaths } from 'astro';
import { formatVersion, getSiteData } from '~/lib/data';
import { renderOg, type OgCard } from '~/lib/og';
import { BYPASS_LABEL, STATUS_META } from '~/lib/taxonomy';

export const getStaticPaths: GetStaticPaths = async () => {
  const { obfuscators, deobfuscators, auth, stats } = await getSiteData();
  const cards: { slug: string; card: OgCard }[] = [
    {
      slug: 'default',
      card: {
        eyebrow: 'Independent index',
        title: 'Lua & Luau obfuscation, tracked in the open.',
        subtitle: 'Obfuscators, deobfuscators and auth services: who protects code, who breaks it, and how fast.',
        footer: `${stats.obfuscators} obfuscators · ${stats.deobfuscators} deobfuscators`,
      },
    },
    ...obfuscators.map((o) => ({
      slug: `obfuscators/${o.id}`,
      card: {
        eyebrow: `Obfuscator · ${formatVersion(o.latest.version)}`,
        title: o.data.name,
        subtitle: o.data.tagline,
        status: { status: o.status, label: STATUS_META[o.status].label },
        score: { total: o.score.total, tier: o.score.tier },
      },
    })),
    ...deobfuscators.map((d) => ({
      slug: `deobfuscators/${d.id}`,
      card: {
        eyebrow: `Deobfuscator · by ${d.data.author}`,
        title: d.data.name,
        subtitle: d.data.tagline,
        status: d.breaksLatest ? { status: 'broken' as const, label: 'Breaks a current version' } : undefined,
      },
    })),
    ...auth.map((a) => ({
      slug: `auth/${a.id}`,
      card: {
        eyebrow: 'Auth service',
        title: a.data.name,
        subtitle: a.data.tagline,
        status: { status: a.status, label: BYPASS_LABEL[a.data.bypass.status] },
      },
    })),
  ];
  return cards.map(({ slug, card }) => ({ params: { slug }, props: { card } }));
};

export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await renderOg(props.card as OgCard)), { headers: { 'Content-Type': 'image/png' } });
