import type { APIRoute } from 'astro';
import { getSiteData } from '~/lib/data';
import { NAV, SITE } from '~/lib/site';

export const GET: APIRoute = async () => {
  const { obfuscators, deobfuscators, auth, samples } = await getSiteData();
  const paths = [
    '/',
    ...NAV.map((n) => n.href),
    '/methodology',
    '/learn',
    '/about',
    '/submit',
    '/api',
    ...obfuscators.map((o) => `/obfuscators/${o.id}`),
    ...deobfuscators.map((d) => `/deobfuscators/${d.id}`),
    ...auth.map((a) => `/auth/${a.id}`),
    ...samples.flatMap((s) => [`/lab/${s.id}`, ...s.runs.map((r) => `/lab/${s.id}/${r.id}`)]),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${new URL(p, SITE.url).toString()}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
