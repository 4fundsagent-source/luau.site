// Motion checks against a running preview server.
// Usage: node scripts/motion-check.mjs [baseUrl]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:4321';
const browser = await chromium.launch();
let failures = 0;
const fail = (m) => (failures++, console.log(`✗ ${m}`));
const ok = (m) => console.log(`✓ ${m}`);
mkdirSync('screenshots/motion', { recursive: true });

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { ctx, p, errors };
}

// 1. Entrance frames + count-up finishes at the server value.
{
  const { ctx, p, errors } = await page();
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  for (const t of [60, 300, 900]) {
    await p.waitForTimeout(t === 60 ? 60 : t - (t === 300 ? 60 : 300));
    await p.screenshot({ path: `screenshots/motion/home-enter-${t}ms.png` });
  }
  await p.waitForTimeout(1400);
  const counts = await p.$$eval('[data-countup]', (els) =>
    els.filter((e) => e.getBoundingClientRect().top < innerHeight).map((e) => ({ want: e.dataset.countup, got: e.textContent.trim(), vis: getComputedStyle(e).visibility })),
  );
  const bad = counts.filter((c) => c.want !== c.got || c.vis !== 'visible');
  bad.length ? fail(`count-up mismatch: ${JSON.stringify(bad)}`) : ok(`count-up settled on ${counts.length} visible numbers`);
  // Scroll the rest into view and make sure everything resolves.
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await p.waitForTimeout(1400);
  const hidden = await p.$$eval('[data-countup]', (els) => els.filter((e) => getComputedStyle(e).visibility !== 'visible' || e.textContent.trim() !== e.dataset.countup).length);
  hidden ? fail(`${hidden} count-up numbers unresolved after scrolling`) : ok('all count-up numbers resolved after scrolling');
  const unrevealed = await p.$$eval('[data-reveal]:not([data-inview])', (els) => els.length);
  unrevealed ? fail(`${unrevealed} [data-reveal] elements never revealed`) : ok('all reveal elements revealed');
  errors.length ? fail(`console errors on home: ${errors.join(' / ')}`) : ok('no console errors on home');
  await ctx.close();
}

// 2. Reduced motion: no motion flag, nothing hidden, no entrance animation.
{
  const { ctx, p } = await page({ reducedMotion: 'reduce' });
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  const state = await p.evaluate(() => ({
    motion: document.documentElement.hasAttribute('data-motion'),
    hiddenNumbers: [...document.querySelectorAll('[data-countup]')].filter((e) => getComputedStyle(e).visibility !== 'visible').length,
    entering: [...document.querySelectorAll('[data-enter]')].filter((e) => getComputedStyle(e).animationName !== 'none' && parseFloat(getComputedStyle(e).animationDuration) > 0.01).length,
  }));
  state.motion || state.hiddenNumbers || state.entering
    ? fail(`reduced motion not respected: ${JSON.stringify(state)}`)
    : ok('reduced motion: no flag, numbers visible, no entrance animation');
  await ctx.close();
}

// 3. Animated filtering still filters, and navigating card → detail works.
{
  const { ctx, p, errors } = await page();
  await p.goto(base + '/obfuscators', { waitUntil: 'networkidle' });
  const total = await p.locator('[data-item]:visible').count();
  await p.click('button[data-filter="status"][data-value="broken"]');
  await p.waitForTimeout(150);
  await p.screenshot({ path: 'screenshots/motion/filter-mid.png' });
  await p.waitForFunction((t) => document.querySelectorAll('[data-item]:not([hidden])').length < t, total);
  await p.waitForTimeout(600);
  const broken = await p.locator('[data-item]:visible').count();
  broken > 0 && broken < total ? ok(`filter animated: ${total} → ${broken}`) : fail(`filter: ${broken}/${total}`);
  const leftover = await p.$$eval('[data-item]', (els) => els.filter((e) => e.style.viewTransitionName).length);
  leftover ? fail('view-transition names left on cards after filtering') : ok('transition names cleaned up');
  await p.click('[data-item]:visible >> nth=0 >> a.card-link');
  await p.waitForLoadState('networkidle');
  /\/obfuscators\/[a-z0-9-]+$/.test(new URL(p.url()).pathname) ? ok(`card → detail navigation: ${new URL(p.url()).pathname}`) : fail(`navigation landed on ${p.url()}`);
  errors.length ? fail(`console errors: ${errors.join(' / ')}`) : ok('no console errors while filtering/navigating');
  await ctx.close();
}

// 4. Theme toggle with circular reveal persists.
{
  const { ctx, p, errors } = await page({ colorScheme: 'light' });
  await p.goto(base + '/rankings', { waitUntil: 'networkidle' });
  await p.click('[data-theme-toggle]');
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'screenshots/motion/theme-mid.png' });
  await p.waitForTimeout(800);
  const t1 = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.reload({ waitUntil: 'networkidle' });
  const t2 = await p.evaluate(() => document.documentElement.dataset.theme);
  t1 === 'dark' && t2 === 'dark' ? ok('theme reveal applied and persisted') : fail(`theme: ${t1} → ${t2}`);
  errors.length ? fail(`console errors: ${errors.join(' / ')}`) : ok('no console errors during theme switch');
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} motion check(s) failed` : '\n✓ motion checks passed');
process.exit(failures ? 1 : 0);
