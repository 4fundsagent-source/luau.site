# luau.site

**The independent index of Lua & Luau obfuscation.** It tracks who protects code, who breaks it, how fast, and with what result. Every claim is sourced, every score is computed, and every change is a public commit.

## What's on the site

| Section | What it shows |
|---|---|
| **Obfuscators** | Every tracked obfuscator: current version, break status, Security Score, links |
| **Deobfuscators** | Devirtualizers, dumpers and lifters: what they target and how much they recover |
| **Rankings** | Leaderboard by Security Score, plus the fastest-broken versions |
| **Timeline** | The arms race: every release and every break on one axis, plus an event log |
| **The Lab** | Our own corpus run through each obfuscator and deobfuscator, verified with the Luau CLI |
| **Auth services** | Key systems and whitelists, and whether they have been bypassed |
| **Open data** | `/api/*.json`, `/feed.xml`, `/sitemap.xml` |

## Stack

Astro (static output) · TypeScript · Tailwind CSS v4 · Shiki · Fuse.js · Satori for OG images · Vitest · Playwright.
The data is YAML under `src/data/`, validated by Zod schemas in `src/content.config.ts`.

## Getting started

```sh
pnpm install
pnpm dev            # http://localhost:4321
```

| Script | Purpose |
|---|---|
| `pnpm build` | Build the static site into `dist/` |
| `pnpm check` | Type-check `.astro` and `.ts` files |
| `pnpm test` | Unit tests for status derivation, scoring, dates and integrity checks |
| `pnpm validate` | Schema + cross-reference + source checks for all data |
| `pnpm lab:verify` | Run every Lab stage with the `luau` CLI and write `lab/results.json` (`--check` for CI) |
| `node scripts/smoke.mjs` | With `pnpm preview` running: axe on every page in both themes, plus search, filter and theme checks |
| `node scripts/screenshots.mjs` | Screenshots at 1440/375 px in light and dark, and reports horizontal overflow |

## How the numbers are made

- **Status** (`src/lib/status.ts`) is derived per version from deobfuscator coverage. *Broken* means a tool with full support produces readable source. *Partial* means only constants, bytecode, traces or experimental support. *Holding* means no public tool is tracked.
- **Time to break** is the date the first breaking tool appeared minus the release date. Month-precision or `~` dates are shown as approximate.
- **Security Score** (`src/lib/score.ts`) is resistance 50 + track record 20 + Lab 20 + technique depth 10. Missing components get neutral half credit, and scores under 70% data-backed are marked provisional.

Full details: [/methodology](https://luau.site/methodology).

## Adding or correcting data

Each entry is one YAML file:

```yaml
# src/data/deobfuscators/my-tool.yaml
name: My Tool
author: someone
tagline: One line, under 140 characters.
description: >-
  A paragraph on how it works.
repo: https://github.com/someone/my-tool
access: open-source          # open-source | free | paid | private
techniques: [static-devirt]  # see src/lib/taxonomy.ts
outputLevel: readable        # constants | bytecode | readable | near-original
firstSeen: 2026-09-02        # or 2026-09, or ~2026-09 if approximate
maintenance: active
targets:
  - obfuscator: luraph       # file name in src/data/obfuscators/
    versions: ["15"]         # must exist in that file's versions
    support: full            # full | partial | experimental
verified: false
lastVerified: 2026-10-03
sources:
  - url: https://github.com/someone/my-tool
    accessed: 2026-10-03
```

Run `pnpm validate` before opening a PR. You can also use the issue forms linked from [/submit](https://luau.site/submit).

**Hosting policy:** we host only our own Lab corpus and the outputs produced from it. Never commit third-party scripts, their deobfuscated output, or tool binaries.

## Deploying

The site is fully static. On Cloudflare Pages: build command `pnpm build`, output directory `dist`, environment `NODE_VERSION=22`. Security and cache headers live in `public/_headers`.

## Seed data status

The initial dataset is a **preview**. Entries are marked `verified: false`, and several dates are approximate (`~`). The site-wide preview banner is controlled by `SITE.dataPreview` in `src/lib/site.ts`.
