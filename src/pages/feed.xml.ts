import type { APIRoute } from 'astro';
import { getSiteData } from '~/lib/data';
import { SITE } from '~/lib/site';
import { EVENT_LABEL } from '~/lib/taxonomy';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async () => {
  const { events, builtAt } = await getSiteData();
  const items = events
    .slice(0, 100)
    .map((e) => {
      const link = new URL(e.href ?? '/timeline', SITE.url).toString();
      const body = [e.summary, e.date.approx || e.date.precision === 'month' ? 'Date is approximate.' : '', `Source: ${e.sources[0]?.url ?? ''}`]
        .filter(Boolean)
        .join(' ');
      return `    <item>
      <title>${esc(e.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(`luau.site:${e.id}`)}</guid>
      <category>${esc(EVENT_LABEL[e.kind])}</category>
      <pubDate>${e.date.date.toUTCString()}</pubDate>
      <description>${esc(body)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>luau.site — activity</title>
    <link>${SITE.url}/timeline</link>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Obfuscator releases, public breaks and new deobfuscators in the Lua and Luau scene.</description>
    <language>en</language>
    <lastBuildDate>${builtAt.toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
