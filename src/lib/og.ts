/**
 * Build-time Open Graph cards (1200×630 PNG) rendered with Satori + resvg.
 * Plain object nodes stand in for JSX so we don't need React.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { DisplayStatus } from './taxonomy';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));

let fonts: { name: string; data: Buffer; weight: 400 | 600; style: 'normal' }[] | undefined;
function loadFonts() {
  fonts ??= [
    { name: 'Geist', data: font('@fontsource/geist', 'geist-latin-400-normal.woff'), weight: 400, style: 'normal' },
    { name: 'Geist', data: font('@fontsource/geist', 'geist-latin-600-normal.woff'), weight: 600, style: 'normal' },
    { name: 'Geist Mono', data: font('@fontsource/geist-mono', 'geist-mono-latin-400-normal.woff'), weight: 400, style: 'normal' },
  ];
  return fonts;
}

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children, ...extra },
});

const C = {
  bg: '#fafaf9',
  fg: '#0b0b0c',
  muted: '#57575f',
  subtle: '#7a7a84',
  line: '#e6e6e3',
  holding: '#0f8a63',
  partial: '#c26f08',
  broken: '#dc2c50',
  open: '#57575f',
};

const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><pattern id="h" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="2.6" stroke="${C.fg}" stroke-width="1.1"/></pattern><clipPath id="c"><circle cx="12" cy="12" r="8"/></clipPath></defs><g clip-path="url(#c)"><rect x="4" y="4" width="8" height="16" fill="${C.fg}"/><rect x="12" y="4" width="8" height="16" fill="url(#h)"/></g><circle cx="12" cy="12" r="8" fill="none" stroke="${C.fg}" stroke-width="1.5"/></svg>`,
)}`;

export interface OgCard {
  eyebrow: string;
  title: string;
  subtitle?: string;
  status?: { status: DisplayStatus; label: string };
  score?: { total: number; tier: string };
  footer?: string;
}

export async function renderOg(card: OgCard): Promise<Buffer> {
  const pill = card.status
    ? h(
        'div',
        {
          alignItems: 'center',
          gap: 12,
          height: 48,
          padding: '0 20px',
          borderRadius: 999,
          border: `2px solid ${C.line}`,
          background: '#ffffff',
          fontSize: 24,
          color: C.fg,
        },
        [h('div', { width: 16, height: 16, borderRadius: 999, background: C[card.status.status] }), card.status.label],
      )
    : null;

  const score = card.score
    ? h('div', { alignItems: 'center', gap: 14, fontSize: 24, color: C.muted }, [
        h('div', { width: 220, height: 10, borderRadius: 999, background: '#ececea', overflow: 'hidden' }, [
          h('div', { width: `${Math.max(2, card.score.total)}%`, height: 10, background: C.fg, borderRadius: 999 }),
        ]),
        h('div', { fontFamily: 'Geist Mono', color: C.fg, fontSize: 28 }, String(card.score.total)),
        h(
          'div',
          {
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${C.line}`,
            borderRadius: 10,
            fontFamily: 'Geist Mono',
            color: C.fg,
          },
          card.score.tier,
        ),
      ])
    : null;

  const tree = h(
    'div',
    {
      width: 1200,
      height: 630,
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 72,
      background: C.bg,
      backgroundImage: `linear-gradient(to right, ${C.line} 1px, transparent 1px), linear-gradient(to bottom, ${C.line} 1px, transparent 1px)`,
      backgroundSize: '60px 60px',
      fontFamily: 'Geist',
      color: C.fg,
    },
    [
      h('div', { alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 600 }, [
        h('img', { width: 44, height: 44 }, undefined, { src: LOGO, width: 44, height: 44 }),
        h('div', {}, [h('span', {}, 'luau'), h('span', { color: C.subtle }, '.site')]),
      ]),
      h('div', { flexDirection: 'column', gap: 18, background: C.bg, padding: '8px 0' }, [
        h('div', { fontFamily: 'Geist Mono', fontSize: 22, letterSpacing: 2, color: C.subtle, textTransform: 'uppercase' }, card.eyebrow),
        h('div', { fontSize: card.title.length > 28 ? 64 : 84, fontWeight: 600, letterSpacing: -2.5, lineHeight: 1.05 }, card.title),
        card.subtitle ? h('div', { fontSize: 30, color: C.muted, lineHeight: 1.35, maxWidth: 980 }, card.subtitle) : null,
      ]),
      h('div', { alignItems: 'center', justifyContent: 'space-between', background: C.bg }, [
        h('div', { alignItems: 'center', gap: 28 }, [pill, score].filter(Boolean)),
        h('div', { fontSize: 22, color: C.subtle }, card.footer ?? 'luau.site'),
      ]),
    ],
  );

  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
