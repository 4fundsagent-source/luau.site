// Usage: node scripts/screenshots.mjs [baseUrl] [paths...]
// Captures each path at desktop and mobile widths in light and dark themes,
// and reports horizontal overflow. Output: screenshots/<name>-<w>-<theme>.png
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4321';
const paths = process.argv.slice(3).length ? process.argv.slice(3) : ['/'];
const widths = (process.env.WIDTHS ?? '1440,375').split(',').map(Number);
const themes = (process.env.THEMES ?? 'light,dark').split(',');
const full = process.env.FULL !== '0';

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch();
let problems = 0;
for (const theme of themes) {
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  ! JS error on ${page.url()}: ${e.message}`));
    for (const p of paths) {
      await page.goto(base + p, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((el) => (el.dataset.inview = '')));
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) {
        problems++;
        console.log(`  ✗ ${p} @${width} ${theme}: horizontal overflow ${overflow}px`);
      }
      const name = (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[/?=&]/g, '_')) + `-${width}-${theme}.png`;
      await page.screenshot({ path: `screenshots/${name}`, fullPage: full });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(problems ? `${problems} overflow problem(s)` : 'No horizontal overflow.');
