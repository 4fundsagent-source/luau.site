/**
 * Refresh star counts and last-push dates for every GitHub repo linked from the
 * dataset. Run weekly in CI with GITHUB_TOKEN; writes src/data/_generated/github.json.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { GITHUB_STATS_PATH, repoKey, type RepoStats } from '../src/lib/github';

const DATA = join(process.cwd(), 'src/data');
const keys = new Set<string>();
for (const dir of ['obfuscators', 'deobfuscators', 'auth']) {
  for (const f of readdirSync(join(DATA, dir)).filter((n) => n.endsWith('.yaml'))) {
    const doc = parse(readFileSync(join(DATA, dir, f), 'utf8')) as { repo?: string };
    const key = repoKey(doc.repo);
    if (key) keys.add(key);
  }
}

const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'luau.site' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const repos: Record<string, RepoStats> = {};
for (const key of [...keys].sort()) {
  const res = await fetch(`https://api.github.com/repos/${key}`, { headers });
  if (!res.ok) {
    console.warn(`! ${key}: HTTP ${res.status}`);
    continue;
  }
  const r = (await res.json()) as { stargazers_count: number; forks_count: number; pushed_at: string; archived: boolean };
  repos[key] = { stars: r.stargazers_count, forks: r.forks_count, pushedAt: r.pushed_at.slice(0, 10), archived: r.archived };
  console.log(`✓ ${key}: ★ ${r.stargazers_count}`);
}

mkdirSync(dirname(GITHUB_STATS_PATH), { recursive: true });
writeFileSync(GITHUB_STATS_PATH, `${JSON.stringify({ fetchedAt: new Date().toISOString().slice(0, 10), repos }, null, 2)}\n`);
console.log(`Wrote ${Object.keys(repos).length} repos.`);
