// End-to-end smoke test against a running preview server.
// Usage: node scripts/smoke.mjs [baseUrl]
//  - every built page: loads without JS errors and has no serious/critical axe violations (light + dark)
//  - ⌘K search finds Luraph; status filter narrows the grid; theme toggle persists
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4321';
const pages = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f === 'index.html') pages.push('/' + p.slice('dist/'.length, -'index.html'.length).replace(/\/$/, ''));
  }
})('dist');

const browser = await chromium.launch();
let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`✗ ${msg}`);
};

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const p of pages.sort()) {
    errors.length = 0;
    const res = await page.goto(base + p, { waitUntil: 'networkidle' });
    if (!res || res.status() !== 200) fail(`${p}: HTTP ${res?.status()}`);
    await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => (el.dataset.inview = '')));
    await page.waitForTimeout(650);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    for (const v of axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact))) {
      fail(`${p} [${theme}] axe ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }
    if (errors.length) fail(`${p} [${theme}] console: ${errors.join(' / ')}`);
  }
  await ctx.close();
}

// Interactions
const ctx = await browser.newContext({ colorScheme: 'light' });
const page = await ctx.newPage();
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.keyboard.press('Control+k');
await page.locator('[data-cmdk-input]').fill('lurph');
await page.waitForSelector('#cmdk-results [role=option]');
const first = await page.locator('#cmdk-results [role=option]').first().innerText();
if (!/Luraph/.test(first)) fail(`search: first result for "lurph" was "${first}"`);
await page.keyboard.press('Enter');
await page.waitForURL(/\/obfuscators\/luraph/);

await page.goto(base + '/obfuscators', { waitUntil: 'networkidle' });
const total = await page.locator('[data-item]:visible').count();
await page.click('button[data-filter="status"][data-value="broken"]');
// Filtering runs inside a view transition, so the DOM updates asynchronously.
await page.waitForFunction((t) => document.querySelectorAll('[data-item]:not([hidden])').length < t, total).catch(() => {});
await page.waitForTimeout(500);
const broken = await page.locator('[data-item]:visible').count();
if (!(broken > 0 && broken < total)) fail(`filter: broken=${broken} total=${total}`);
if (!page.url().includes('status=broken')) fail('filter: URL not updated');
await page.reload({ waitUntil: 'networkidle' });
if ((await page.locator('[data-item]:visible').count()) !== broken) fail('filter: state not restored from URL');

await page.click('[data-theme-toggle]');
await page.waitForTimeout(900);
await page.reload();
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
if (theme !== 'dark') fail(`theme toggle did not persist (got ${theme})`);

await browser.close();
console.log(failures ? `\n${failures} failure(s) across ${pages.length} pages` : `\n✓ ${pages.length} pages × 2 themes clean; interactions OK`);
process.exit(failures ? 1 : 0);
