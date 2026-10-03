export const SITE = {
  name: 'luau.site',
  url: 'https://luau.site',
  title: 'luau.site — the independent index of Lua & Luau obfuscation',
  description:
    'Track Lua and Luau obfuscators, deobfuscators and auth services in one place: who protects code, who breaks it, how fast, and with what result. Sourced, scored in the open.',
  repo: 'https://github.com/4fundsagent-source/luau.site',
  /** Shows the "preview data" banner until the seed dataset has been verified. */
  dataPreview: true,
  /** Entries not re-verified for this many days are flagged as possibly outdated. */
  staleAfterDays: 90,
} as const;

export const NAV = [
  { href: '/obfuscators', label: 'Obfuscators' },
  { href: '/deobfuscators', label: 'Deobfuscators' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/lab', label: 'Lab' },
  { href: '/auth', label: 'Auth' },
] as const;

type IssueTemplate = 'new-obfuscator' | 'new-deobfuscator' | 'version-release' | 'correction' | 'vendor-statement';

export function issueUrl(template: IssueTemplate, params: Record<string, string> = {}): string {
  const q = new URLSearchParams({ template: `${template}.yml`, ...params });
  return `${SITE.repo}/issues/new?${q.toString()}`;
}

export function editUrl(path: string): string {
  return `${SITE.repo}/edit/main/${path}`;
}
