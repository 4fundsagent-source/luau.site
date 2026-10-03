/**
 * Repository stats refreshed weekly by .github/workflows/refresh-github-stats.yml
 * into src/data/_generated/github.json. Optional: the site renders without it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface RepoStats {
  stars: number;
  forks: number;
  pushedAt: string;
  archived: boolean;
}

export const GITHUB_STATS_PATH = resolve(process.cwd(), 'src/data/_generated/github.json');

/** "https://github.com/Owner/Repo(.git)(/...)" → "owner/repo"; anything else → undefined. */
export function repoKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?(?:\/.*)?$/.exec(url);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : undefined;
}

let cache: Record<string, RepoStats> | undefined;
export function githubStats(url: string | undefined): RepoStats | undefined {
  const key = repoKey(url);
  if (!key) return undefined;
  cache ??= existsSync(GITHUB_STATS_PATH)
    ? ((JSON.parse(readFileSync(GITHUB_STATS_PATH, 'utf8')) as { repos: Record<string, RepoStats> }).repos ?? {})
    : {};
  return cache[key];
}
