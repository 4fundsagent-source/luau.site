import { createHighlighter, type Highlighter } from 'shiki';

let highlighter: Promise<Highlighter> | undefined;

/** Max characters we syntax-highlight; larger files are truncated for display. */
export const DISPLAY_LIMIT = 64 * 1024;

export async function highlight(code: string, lang: 'luau' | 'text' = 'luau'): Promise<string> {
  highlighter ??= createHighlighter({ themes: ['github-light', 'github-dark-dimmed'], langs: ['luau'] });
  const hl = await highlighter;
  return hl.codeToHtml(code, {
    lang: lang === 'text' ? 'text' : 'luau',
    themes: { light: 'github-light', dark: 'github-dark-dimmed' },
    defaultColor: false,
    // github-light's orange (#e36209) is 3.5:1 on white; darken it to pass WCAG AA.
    colorReplacements: { 'github-light': { '#e36209': '#b35200' } },
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
